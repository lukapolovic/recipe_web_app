import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpStore, createDemoStore } from '../public/cookbook-store.js';
import { demoData } from '../public/social-demo.js';

const BOOK = 'demo-our-kitchen';
const RECIPE = 'demo-lemon-chicken';
const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map };
};
const makeDemo = (options = {}) => createDemoStore({ loadDemoData: async () => demoData, storage: memoryStorage(), ...options });

// A minimal stand-in for the /api/social routes the HTTP adapter uses.
function fakeServer() {
  const state = { plan: { cart: [], checked: {}, version: 0 }, conflicts: 0, calls: [], photos: new Map([['photo-1', new Blob(['jpg'], { type: 'image/webp' })]]), uploads: 0 };
  const recipe = demoData.recipes.find(r => r.id === RECIPE);
  const book = demoData.cookbooks.find(b => b.id === BOOK);
  const reply = (value, status = 200) => Response.json(value, { status });
  const fetcher = async (path, options = {}) => {
    const method = options.method || 'GET', auth = options.headers?.Authorization;
    state.calls.push({ path, method, auth, body: options.body });
    if (path === '/api/social/auth/login') return reply({ session: { accessToken: 'one', refreshToken: 'r1', expiresAt: 1 } });
    if (path === '/api/social/auth/refresh') return reply({ session: { accessToken: 'two', refreshToken: 'r2' } });
    if (path === '/api/social/auth/logout') return reply({ signedOut: true });
    if (auth === 'Bearer one' && state.expire) return reply({ error: 'Your session expired.' }, 401);
    if (path === `/api/social/cookbooks/${BOOK}/planner` && method === 'GET') return reply(structuredClone(state.plan));
    if (path === `/api/social/cookbooks/${BOOK}/planner` && method === 'PUT') {
      const next = JSON.parse(options.body);
      if (state.conflicts > 0) { state.conflicts--; state.plan = { ...state.plan, version: state.plan.version + 1 }; return reply({ error: 'The shopping list changed on another device.' }, 409); }
      if (next.version !== state.plan.version) return reply({ error: 'The shopping list changed on another device.' }, 409);
      state.plan = { cart: next.cart, checked: next.checked, version: next.version + 1 };
      return reply(structuredClone(state.plan));
    }
    if (path === `/api/social/recipes/${RECIPE}`) return reply(recipe);
    if (path === `/api/social/cookbooks/${BOOK}`) return reply(book);
    if (path.startsWith('/api/social/search')) return reply({ recipes: [recipe] });
    const photo = path.match(/^\/api\/social\/photos\/(.+)$/);
    if (photo && method === 'GET') return state.photos.has(photo[1]) ? new Response(state.photos.get(photo[1])) : reply({ error: 'missing' }, 404);
    if (path === '/api/social/photos' && method === 'POST') { state.uploads++; return reply({ imageId: `up-${state.uploads}` }, 201); }
    const copy = path.match(/^\/api\/social\/photos\/(.+)\/copy$/);
    if (copy && method === 'POST') return state.photos.has(copy[1]) ? reply({ imageId: `copy-of-${copy[1]}` }, 201) : reply({ error: 'missing' }, 404);
    if (photo && method === 'DELETE') { state.deleted = [...(state.deleted || []), photo[1]]; return reply({ deleted: true }); }
    return reply({ error: 'Endpoint not found.' }, 404);
  };
  return { fetcher, state };
}
function makeHttp(overrides = {}) {
  const rows = { recipes: [], cookbooks: [] };
  const host = {
    recipeById: id => rows.recipes.find(r => r.id === id), bookById: id => rows.cookbooks.find(b => b.id === id), recipes: () => rows.recipes,
    mergeRows(name, items) { for (const item of items) { const at = rows[name].findIndex(r => r.id === item.id); if (at < 0) rows[name].push(item); else rows[name][at] = item; } },
    setBook(book, recipes) { host.mergeRows('cookbooks', [book]); host.mergeRows('recipes', recipes); },
  };
  const server = fakeServer();
  const storage = memoryStorage();
  return { store: createHttpStore({ host, fetcher: server.fetcher, storage }), server, rows, storage, ...overrides };
}

// Behaviour every adapter must share, whatever is behind it.
for (const [name, build] of [['demo', async () => ({ store: await makeDemo() })], ['http', async () => makeHttp()]]) {
  test(`${name} store: a shared shopping list can be loaded, changed and emptied`, async () => {
    const { store } = await build();
    const empty = await store.loadPlan(BOOK);
    assert.deepEqual(empty.cart, []);
    const added = await store.changePlan(BOOK, state => { state.cart.push({ recipeId: RECIPE, servings: 4 }); });
    assert.deepEqual(added.cart, [{ recipeId: RECIPE, servings: 4 }]);
    assert.ok(added.version > empty.version);
    assert.deepEqual((await store.loadPlan(BOOK)).cart, added.cart);
    const emptied = await store.changePlan(BOOK, state => { state.cart = []; }, added);
    assert.deepEqual(emptied.cart, []);
  });
  test(`${name} store: ticked rows that no longer exist are pruned`, async () => {
    const { store } = await build();
    await store.loadPlan(BOOK);
    const saved = await store.changePlan(BOOK, state => { state.cart.push({ recipeId: RECIPE, servings: 2 }); state.checked['made-up|1'] = true; });
    assert.deepEqual(saved.checked, {});
  });
}

test('demo store enforces the cookbook rules the hosted database enforces', async () => {
  const store = await makeDemo();
  const { user } = await store.loadFeed();
  const book = await store.mutate('/cookbooks', 'POST', { name: 'Ours', visibility: 'private', coverColor: 'rose' });
  assert.equal(book.ownerId, user.id);
  const recipe = await store.mutate('/recipes', 'POST', { cookbookId: book.id, title: 'Toast', servings: 2, ingredients: [{ name: 'Bread', quantity: 1, unit: 'piece' }] });
  await assert.rejects(store.mutate('/recipes', 'POST', { cookbookId: 'demo-sunday', title: 'Nope' }), /Choose one of your cookbooks/);
  await assert.rejects(store.mutate('/cookbooks/demo-sunday', 'DELETE'), /Only the owner/);
  await assert.rejects(store.mutate(`/recipes/${recipe.id}/review`, 'PUT', { rating: 5, comment: 'Mine' }), /cannot rate it yourself/);
  await store.changePlan(book.id, state => { state.cart.push({ recipeId: recipe.id, servings: 2 }); });
  await store.mutate(`/recipes/${recipe.id}`, 'DELETE');
  assert.deepEqual((await store.loadPlan(book.id)).cart, [], 'deleting a recipe removes it from shopping lists');
  await store.mutate(`/cookbooks/${book.id}`, 'DELETE');
  const { feed } = await store.loadFeed();
  assert.equal(feed.cookbooks.some(b => b.id === book.id), false);
});

test('demo store keeps changes in browser storage, and the design preview keeps nothing', async () => {
  const storage = memoryStorage();
  const first = await createDemoStore({ loadDemoData: async () => demoData, storage });
  await first.mutate('/cookbooks', 'POST', { name: 'Kept', visibility: 'private', coverColor: 'rose' });
  const again = await createDemoStore({ loadDemoData: async () => demoData, storage });
  assert.ok((await again.loadFeed()).feed.cookbooks.some(b => b.name === 'Kept'));
  const preview = await createDemoStore({ loadDemoData: async () => demoData, storage: memoryStorage(), preview: true });
  await preview.mutate('/cookbooks', 'POST', { name: 'Gone', visibility: 'private', coverColor: 'rose' });
  assert.equal(preview.demo, true);
  await assert.rejects(preview.importRecipe({ text: 'x' }), /sample recipes only/);
  await assert.rejects(preview.fetchPhoto('x'), /sample recipes only/);
  assert.equal(await preview.copyPhoto('shared'), 'shared');
  assert.equal(await preview.search({ q: 'x' }), null, 'sample kitchen filters the feed on the page');
});

test('http store signs in, sends the bearer token and refreshes an expired session once', async () => {
  const { store, server, storage } = makeHttp();
  assert.equal(store.restoreSession(), false);
  await store.signIn('login', { email: 'a@b.c', password: 'secret123' });
  assert.ok(storage.getItem('thyme-two-session-v1'));
  await store.loadPlan(BOOK);
  assert.equal(server.state.calls.find(c => c.path.endsWith('/planner')).auth, 'Bearer two', 'an already-expired session refreshes before the request');
  await store.signOut();
  assert.equal(storage.getItem('thyme-two-session-v1'), null);
});

test('http store retries a request once with a refreshed token after a 401', async () => {
  const { store, server, storage } = makeHttp();
  storage.setItem('thyme-two-session-v1', JSON.stringify({ accessToken: 'one', refreshToken: 'r1' }));
  assert.equal(store.restoreSession(), true);
  server.state.expire = true;
  await store.loadPlan(BOOK);
  const planCalls = server.state.calls.filter(c => c.path.endsWith('/planner'));
  assert.deepEqual(planCalls.map(c => c.auth), ['Bearer one', 'Bearer two']);
});

test('http store retries a conflicting shopping-list save with the latest list, then gives up', async () => {
  const { store, server } = makeHttp();
  const known = await store.loadPlan(BOOK);
  server.state.conflicts = 1;
  const saved = await store.changePlan(BOOK, state => { state.cart.push({ recipeId: RECIPE, servings: 2 }); }, known);
  assert.equal(saved.cart.length, 1);
  assert.equal(server.state.calls.filter(c => c.method === 'PUT').length, 2);
  server.state.conflicts = 5;
  await assert.rejects(store.changePlan(BOOK, state => { state.cart = []; }, saved), error => error.status === 409);
});

test('http store asks the server to copy a photo, and falls back to no photo', async () => {
  const { store } = makeHttp();
  assert.equal(await store.copyPhoto('photo-1'), 'copy-of-photo-1');
  assert.equal(await store.copyPhoto('missing'), '');
  await assert.rejects(store.fetchPhoto('missing'), /Photo unavailable/);
});

for (const [name, build] of [['demo', async () => ({ store: await makeDemo() })], ['http', async () => makeHttp()]]) {
  test(`${name} store: photos staged for a draft are deleted unless a recipe keeps them`, async () => {
    const { store, server } = await build();
    if (!server) {
      const sent = [];
      const fetcher = async (path, options) => { sent.push([path, options.method]); return Response.json(options.method === 'POST' ? { imageId: `p${sent.length}` } : { deleted: true }); };
      const withFetch = await makeDemo({ fetcher });
      const a = await withFetch.uploadPhoto(new Blob(['a'], { type: 'image/png' }));
      const b = await withFetch.uploadPhoto(new Blob(['b'], { type: 'image/png' }));
      withFetch.keepPhoto(a.imageId);
      await withFetch.discardDrafts();
      assert.deepEqual(sent.filter(([, method]) => method === 'DELETE').map(([path]) => path), [`/api/photos/${b.imageId}`]);
      await withFetch.discardDrafts();
      assert.equal(sent.filter(([, method]) => method === 'DELETE').length, 1, 'drafts are only discarded once');
      return;
    }
    const a = await store.uploadPhoto(new Blob(['a'], { type: 'image/png' }));
    const b = await store.uploadPhoto(new Blob(['b'], { type: 'image/png' }));
    const copied = await store.copyPhoto('photo-1');
    store.keepPhoto(a.imageId);
    await store.discardDrafts();
    assert.deepEqual(server.state.deleted.sort(), [b.imageId, copied].sort());
  });
}

test('http store search merges found rows and fetches cookbooks it has not seen', async () => {
  const { store, rows } = makeHttp();
  const result = await store.search({ q: 'lemon', category: '', meatType: '', tag: '' });
  assert.equal(result.recipes.length, 1);
  assert.equal(rows.recipes[0].id, RECIPE);
  assert.equal(rows.cookbooks[0].id, BOOK);
  const aborted = new AbortController(); aborted.abort();
  assert.equal(await store.search({ q: 'x' }, aborted.signal).catch(() => null), null);
});
