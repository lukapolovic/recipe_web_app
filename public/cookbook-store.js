import { shoppingList, checkKey } from './recipe-math.js';

// The Cookbook store: everything the pages need from "the kitchen" without
// knowing where it lives. Two adapters implement the same interface.
//
//   createHttpStore  - real accounts; talks to /api/social with a bearer token.
//   createDemoStore  - sample people and cookbooks kept in this browser. It also
//                      backs the design preview (preview: true: nothing is saved
//                      and nothing touches the network).
//
// Interface (both adapters):
//   demo                               true for the sample kitchen
//   loadFeed()                         -> { feed, user, profile }
//   hydrateBook(id) / hydrateSelection({ view, selectedId })
//                                      fetch rows a page needs, through the host
//   search({ q, category, meatType, tag }, signal)
//                                      -> result to render, or null to filter the feed locally
//   mutate(path, method, input)        resource commands, e.g. ('/cookbooks', 'POST', {...})
//   loadPlan(bookId) / changePlan(bookId, operation, known)
//                                      shared shopping list; changePlan returns the saved state
//   importRecipe(input), uploadPhoto(blob), fetchPhoto(id) -> Blob,
//   discardPhoto(id), copyPhoto(id) -> id for a copy
//   keepPhoto(id)                      a recipe now uses this photo
//   discardDrafts()                    delete photos that were staged but never kept
//   signOut(), dropSession()
//
// `host` is the page's row cache: { recipeById, bookById, recipes(), mergeRows(name, rows), setBook(book, recipes) }.

const SESSION_KEY = 'thyme-two-session-v1';
const DEMO_KEY = 'thyme-two-demo-v1';
const clone = value => structuredClone(value);
const emptyPlan = () => ({ cart: [], checked: {}, version: 0 });
const defaultStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

// Keep only ticked rows that still exist in the list.
function pruneChecked(state, recipes) {
  const valid = new Set(shoppingList(recipes, state.cart).map(checkKey));
  state.checked = Object.fromEntries(Object.entries(state.checked).filter(([key]) => valid.has(key)));
}

async function request(fetcher, path, options = {}, token = '') {
  let response;
  try {
    response = await fetcher(path, { ...options, headers: { ...(!(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  } catch { throw new Error('The kitchen is offline. Check your connection and try again.'); }
  return response;
}
// Photos staged while a recipe is being drafted (uploaded, imported or copied)
// are deleted unless the draft is saved: keepPhoto() marks one as in use.
function trackDrafts(store) {
  const pending = new Set(), { uploadPhoto, importRecipe, copyPhoto, discardPhoto } = store;
  return Object.assign(store, {
    async uploadPhoto(blob) { const result = await uploadPhoto(blob); pending.add(result.imageId); return result; },
    async importRecipe(input) { const result = await importRecipe(input); if (result.recipe?.imageId) pending.add(result.recipe.imageId); return result; },
    async copyPhoto(id) { const copy = await copyPhoto(id); if (copy && copy !== id) pending.add(copy); return copy; },
    keepPhoto(id) { pending.delete(id); },
    async discardDrafts() { const ids = [...pending]; pending.clear(); await Promise.allSettled(ids.map(discardPhoto)); },
  });
}
async function download(fetcher, path, token = '') {
  let response;
  try { response = await fetcher(path, token ? { headers: { Authorization: `Bearer ${token}` } } : {}); }
  catch { throw new Error('Photo unavailable'); }
  if (!response.ok) throw new Error('Photo unavailable');
  return response.blob();
}
async function parse(response) {
  // An HTML error page from a proxy should not surface as a JSON parse error.
  let result, parsed = true;
  try { result = await response.json(); } catch { parsed = false; }
  if (!response.ok || !parsed) throw Object.assign(new Error(result?.error || 'That change could not be saved.'), { status: response.status });
  return result;
}

export function createHttpStore({ host, fetcher = (...args) => fetch(...args), storage = defaultStorage() } = {}) {
  let session = null, refreshPromise = null;
  function saveSession(value) {
    session = value;
    try { if (value) storage.setItem(SESSION_KEY, JSON.stringify(value)); else storage.removeItem(SESSION_KEY); } catch { /* Storage can be unavailable; the session then lasts for this page. */ }
  }
  async function refreshSession() {
    if (!session?.refreshToken) return false;
    if (!refreshPromise) refreshPromise = (async () => {
      const response = await fetcher('/api/social/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
      if (!response.ok) { saveSession(null); return false; }
      const result = await response.json(); saveSession(result.session); return !!session;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function api(path, options = {}, retry = true) {
    if (session?.expiresAt && session.expiresAt * 1000 < Date.now() + 30000 && !path.includes('/auth/')) await refreshSession();
    const response = await request(fetcher, path, options, session?.accessToken);
    if (response.status === 401 && retry && !path.includes('/auth/') && await refreshSession()) return api(path, options, false);
    return parse(response);
  }
  const json = body => JSON.stringify(body);

  async function hydratePlanRecipes(state, refresh = false) {
    const results = await Promise.all(state.cart.map(async entry => {
      try {
        const recipe = !refresh && host.recipeById(entry.recipeId) || await api(`/api/social/recipes/${entry.recipeId}`);
        return { entry, recipe };
      } catch (error) { if (error.status !== 404 && error.status !== 403) throw error; return null; }
    }));
    const available = results.filter(Boolean);
    host.mergeRows('recipes', available.map(result => result.recipe));
    const bookIds = [...new Set(available.map(result => result.recipe.cookbookId))].filter(id => !host.bookById(id));
    host.mergeRows('cookbooks', await Promise.all(bookIds.map(id => api(`/api/social/cookbooks/${id}`))));
    if (available.length !== state.cart.length) state.checked = {};
    state.cart = available.map(result => result.entry);
  }

  const store = {
    demo: false,
    config: () => api('/api/social/config'),
    restoreSession() {
      try { session = JSON.parse(storage.getItem(SESSION_KEY)); } catch { session = null; }
      return !!session;
    },
    async signIn(mode, input) {
      const result = await api(`/api/social/auth/${mode === 'signup' ? 'signup' : 'login'}`, { method: 'POST', body: json(input) });
      if (!result.confirmationRequired) saveSession(result.session);
      return result;
    },
    async signOut() {
      try { await api('/api/social/auth/logout', { method: 'POST', body: '{}' }); } catch { /* The local session is cleared either way. */ }
      saveSession(null);
    },
    dropSession() { saveSession(null); },

    async loadFeed() {
      const [feed, me] = await Promise.all([api('/api/social/feed'), api('/api/social/me')]);
      return { feed, user: me.user, profile: me.profile };
    },
    async hydrateBook(id) {
      if (!id) return;
      const [book, recipes] = await Promise.all([api(`/api/social/cookbooks/${id}`), api(`/api/social/recipes?cookbookId=${id}`)]);
      host.setBook(book, recipes);
    },
    async hydrateSelection({ view, selectedId }) {
      if (!selectedId || (view !== 'book' && view !== 'recipe')) return;
      try {
        if (view === 'book') await store.hydrateBook(selectedId);
        else {
          const recipe = await api(`/api/social/recipes/${selectedId}`);
          host.mergeRows('recipes', [recipe]);
          if (!host.bookById(recipe.cookbookId)) host.mergeRows('cookbooks', [await api(`/api/social/cookbooks/${recipe.cookbookId}`)]);
        }
      } catch (error) { if (error.status !== 404) throw error; }
    },
    async search(params, signal) {
      const result = await api(`/api/social/search?${new URLSearchParams(params)}`, { signal });
      if (signal?.aborted) return null;
      for (const name of ['profiles', 'cookbooks', 'recipes']) { result[name] ||= []; host.mergeRows(name, result[name]); }
      const missing = [...new Set(result.recipes.map(r => r.cookbookId))].filter(id => !host.bookById(id));
      const books = await Promise.all(missing.map(id => api(`/api/social/cookbooks/${id}`, { signal }).catch(() => null)));
      if (signal?.aborted) return null;
      host.mergeRows('cookbooks', books.filter(Boolean));
      return result;
    },
    mutate: (path, method, input) => api(`/api/social${path}`, { method, ...(input !== undefined ? { body: json(input) } : {}) }),

    async loadPlan(bookId) {
      const state = await api(`/api/social/cookbooks/${bookId}/planner`);
      await hydratePlanRecipes(state, true);
      return state;
    },
    async changePlan(bookId, operation, known) {
      for (let attempt = 0; attempt < 3; attempt++) {
        // Try the copy we already hold first; the version check rejects it (409)
        // if someone else saved meanwhile, and only then is the latest fetched.
        const local = attempt === 0 && known && Number.isSafeInteger(known.version);
        const latest = local ? clone(known) : await api(`/api/social/cookbooks/${bookId}/planner`);
        await hydratePlanRecipes(latest);
        const desired = clone(latest); operation(desired); pruneChecked(desired, host.recipes());
        try { return await api(`/api/social/cookbooks/${bookId}/planner`, { method: 'PUT', body: json(desired) }); }
        catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
      }
    },

    importRecipe: input => api('/api/social/import', { method: 'POST', body: json(input) }),
    uploadPhoto: blob => api('/api/social/photos', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob }),
    fetchPhoto: id => download(fetcher, `/api/social/photos/${id}`, session?.accessToken),
    discardPhoto: id => api(`/api/social/photos/${id}`, { method: 'DELETE' }),
    // A copy needs its own stored photo: the original belongs to someone else's cookbook.
    async copyPhoto(id) {
      try { return (await api(`/api/social/photos/${id}/copy`, { method: 'POST', body: '{}' })).imageId; }
      catch { return ''; }
    },
  };
  return trackDrafts(store);
}

export async function createDemoStore({ loadDemoData, preview = false, storage = defaultStorage(), fetcher = (...args) => fetch(...args), notify = () => {} } = {}) {
  const seed = await loadDemoData();
  let saved;
  if (!preview) { try { saved = JSON.parse(storage.getItem(DEMO_KEY)); } catch { /* Start from the sample kitchen. */ } }
  const data = !preview && saved?.cookbooks && saved?.profiles ? saved : clone(seed);
  const user = data.currentUser || clone(seed.currentUser);
  const profile = data.profiles.find(p => p.id === user.id) || user;
  for (const key of ['friendships', 'follows', 'reviews', 'replies', 'memberships']) data[key] ||= [];
  data.plans ||= {};
  const uuid = () => crypto.randomUUID();
  const offline = () => { throw new Error('The design preview uses sample recipes only.'); };
  const api = async (path, options) => preview ? offline() : parse(await request(fetcher, path, options));

  function save() {
    if (preview) return;
    try { storage.setItem(DEMO_KEY, JSON.stringify(data)); } catch { notify('Preview storage is full. Changes will last for this session.'); }
  }
  const book = id => data.cookbooks.find(b => b.id === id);
  const recipe = id => data.recipes.find(r => r.id === id);
  const accepted = id => data.memberships.filter(m => m.cookbookId === id && m.status === 'accepted');
  const memberOf = b => !!b && (b.ownerId === user.id || accepted(b.id).some(m => m.userId === user.id));
  const reviewsOf = id => data.reviews.filter(r => r.recipeId === id);
  const byUsername = name => data.profiles.find(p => p.username.toLowerCase() === name.replace(/^@/, '').toLowerCase());

  // The sample kitchen enforces the same rules the hosted database does.
  function mutation(path, method, input = {}) {
    const stamp = new Date().toISOString(); let match, result = {};
    if (path === '/cookbooks' && method === 'POST') {
      const row = { ...input, id: uuid(), ownerId: user.id, createdAt: stamp }; delete row.partner; data.cookbooks.unshift(row); result = row;
    } else if ((match = path.match(/^\/cookbooks\/([^/]+)$/)) && method === 'PUT') {
      const row = book(match[1]); if (!row || row.ownerId !== user.id) throw new Error('Only the cookbook owner can edit its cover.'); Object.assign(row, input); result = row;
    } else if ((match = path.match(/^\/cookbooks\/([^/]+)$/)) && method === 'DELETE') {
      const row = book(match[1]); if (!row || row.ownerId !== user.id) throw new Error('Only the owner can delete this cookbook.');
      const ids = new Set(data.recipes.filter(r => r.cookbookId === row.id).map(r => r.id)), reviewIds = new Set(data.reviews.filter(r => ids.has(r.recipeId)).map(r => r.id));
      data.cookbooks = data.cookbooks.filter(b => b.id !== row.id); data.recipes = data.recipes.filter(r => !ids.has(r.id)); data.reviews = data.reviews.filter(r => !ids.has(r.recipeId)); data.replies = data.replies.filter(r => !reviewIds.has(r.reviewId)); data.memberships = data.memberships.filter(m => m.cookbookId !== row.id); data.follows = data.follows.filter(f => f.cookbookId !== row.id); delete data.plans[row.id];
    } else if ((match = path.match(/^\/cookbooks\/([^/]+)\/invite$/))) {
      const recipient = byUsername(input.username); if (!recipient) throw new Error('That username was not found in the preview kitchen.'); if (recipient.id === user.id) throw new Error('Invite your partner’s username.');
      if (data.memberships.some(m => m.cookbookId === match[1] && m.userId === recipient.id)) throw new Error('An invitation or membership already exists.');
      const row = { id: uuid(), cookbookId: match[1], userId: recipient.id, role: 'partner', status: 'invited', cookbookName: book(match[1])?.name }; data.memberships.push(row); result = row;
    } else if ((match = path.match(/^\/invitations\/([^/]+)\/accept$/))) {
      const row = data.memberships.find(m => m.id === match[1] && m.userId === user.id); if (!row) throw new Error('Invitation not found.'); row.status = 'accepted'; result = row;
    } else if (path === '/recipes' && method === 'POST') {
      if (!memberOf(book(input.cookbookId))) throw new Error('Choose one of your cookbooks.');
      const row = { ...input, id: uuid(), createdBy: user.id, createdAt: stamp }; data.recipes.unshift(row); result = row;
    } else if ((match = path.match(/^\/recipes\/([^/]+)$/)) && method === 'PUT') {
      const row = recipe(match[1]); if (!row || !memberOf(book(row.cookbookId))) throw new Error('Only cookbook editors can change this recipe.'); Object.assign(row, input); result = row;
    } else if ((match = path.match(/^\/recipes\/([^/]+)$/)) && method === 'DELETE') {
      const row = recipe(match[1]); if (!row || !memberOf(book(row.cookbookId))) throw new Error('Only cookbook editors can delete this recipe.');
      const reviewIds = new Set(reviewsOf(row.id).map(r => r.id)); data.recipes = data.recipes.filter(r => r.id !== row.id); data.reviews = data.reviews.filter(r => r.recipeId !== row.id); data.replies = data.replies.filter(r => !reviewIds.has(r.reviewId));
      for (const plan of Object.values(data.plans)) plan.cart = plan.cart.filter(e => e.recipeId !== row.id);
    } else if ((match = path.match(/^\/recipes\/([^/]+)\/review$/))) {
      const row = recipe(match[1]); if (memberOf(book(row?.cookbookId))) throw new Error('You can reply to reviews on your own cookbook, but cannot rate it yourself.');
      const existing = data.reviews.find(r => r.recipeId === match[1] && r.userId === user.id);
      if (method === 'DELETE') { data.reviews = data.reviews.filter(r => r !== existing); if (existing) data.replies = data.replies.filter(r => r.reviewId !== existing.id); }
      else { if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Choose a rating from 1 to 5.'); if (existing) { Object.assign(existing, input); result = existing; } else { result = { id: uuid(), recipeId: match[1], userId: user.id, ...input, createdAt: stamp }; data.reviews.push(result); } }
    } else if ((match = path.match(/^\/reviews\/([^/]+)\/replies$/))) {
      const review = data.reviews.find(r => r.id === match[1]); if (!review || (review.userId !== user.id && !memberOf(book(recipe(review.recipeId)?.cookbookId)))) throw new Error('You can reply to notes on your cookbook or to your own review.');
      result = { id: uuid(), reviewId: match[1], userId: user.id, comment: input.comment, createdAt: stamp }; data.replies.push(result);
    } else if (path === '/friends' && method === 'POST') {
      const recipient = byUsername(input.username); if (!recipient) throw new Error('That username was not found in this preview.'); if (recipient.id === user.id) throw new Error('Find another cook to add as a friend.');
      if (data.friendships.some(f => [f.requesterId, f.recipientId].includes(user.id) && [f.requesterId, f.recipientId].includes(recipient.id))) throw new Error('You are already friends, or a request is waiting.');
      result = { id: uuid(), requesterId: user.id, recipientId: recipient.id, status: 'pending', createdAt: stamp }; data.friendships.push(result);
    } else if ((match = path.match(/^\/friends\/([^/]+)\/accept$/))) {
      const row = data.friendships.find(f => f.id === match[1] && f.recipientId === user.id); if (!row) throw new Error('Friend request not found.'); row.status = 'accepted'; result = row;
    } else if ((match = path.match(/^\/cookbooks\/([^/]+)\/follow$/))) {
      data.follows = data.follows.filter(f => !(f.cookbookId === match[1] && f.userId === user.id)); if (method !== 'DELETE') data.follows.push({ cookbookId: match[1], userId: user.id });
    } else if (path === '/profile' && method === 'PUT') {
      if (!/^[a-z0-9_]{3,30}$/.test(input.username)) throw new Error('Use 3–30 lowercase letters, numbers or underscores.'); if (data.profiles.some(p => p.id !== user.id && p.username === input.username)) throw new Error('That username is taken.'); Object.assign(profile, input); result = profile;
    } else throw new Error('This action is not available in the preview.');
    save(); return clone(result);
  }

  // Plans only list recipes that still exist.
  const livePlan = state => { state.cart = state.cart.filter(entry => recipe(entry.recipeId)); return state; };

  return trackDrafts({
    demo: true,
    // The same object is returned each time: pages and this store share one copy of the kitchen.
    loadFeed: async () => ({ feed: data, user, profile }),
    hydrateBook: async () => {},
    hydrateSelection: async () => {},
    search: async () => null,
    mutate: async (path, method, input) => mutation(path, method, input),

    loadPlan: async bookId => livePlan(clone(data.plans[bookId] || emptyPlan())),
    async changePlan(bookId, operation) {
      const state = livePlan(clone(data.plans[bookId] || emptyPlan()));
      operation(state); pruneChecked(state, data.recipes); state.version++;
      data.plans[bookId] = state; save();
      return clone(state);
    },

    importRecipe: input => api('/api/import', { method: 'POST', body: JSON.stringify(input) }),
    uploadPhoto: blob => api('/api/photos', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob }),
    fetchPhoto: async id => preview ? offline() : download(fetcher, `/api/photos/${id}`),
    discardPhoto: id => api(`/api/photos/${id}`, { method: 'DELETE' }),
    // Sample photos are shared by reference; there is nothing to copy.
    copyPhoto: async id => id,
    signOut: async () => {},
    dropSession() {},
  });
}
