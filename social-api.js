import { APP_NAME } from './public/brand.js';
import { validateSocialRecipe, reviseRecipe, ValidationError, CATEGORIES, PROTEINS } from './recipe-model.js';
import { validateMealPlan } from './meal-plan.js';
import { UUID } from './ids.js';

const COLORS = ['rose', 'olive', 'ochre', 'terracotta'];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const id = value => { if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'Choose a valid item.'); return value; };
const string = (value, label, max, optional = false) => {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} must be between 1 and ${max} characters.`);
  return value.trim();
};
// Domain modules throw ValidationError; the HTTP edge reports it as a 400.
const checked = check => { try { return check(); } catch (error) { if (error instanceof ValidationError) fail(400, error.message); throw error; } };
const object = input => { if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Provide an object.'); return input; };
const username = value => { const name = string(value, 'Username', 30).toLowerCase(); if (!/^[a-z0-9_]{3,30}$/.test(name)) fail(400, 'Use 3–30 lowercase letters, numbers or underscores for your username.'); return name; };
const camel = key => key.replace(/_([a-z])/g, (_, character) => character.toUpperCase());
export function decodeSocial(value) {
  if (Array.isArray(value)) return value.map(decodeSocial);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === 'source_calories' ? 'sourceCaloriesPerServing' : camel(key), ['ingredients', 'instructions', 'state', 'checked'].includes(key) ? item : decodeSocial(item)]));
}
function session(value) {
  if (!value?.access_token) return null;
  return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in, user: value.user };
}
function tokenFrom(headers = {}) {
  const header = typeof headers.get === 'function' ? headers.get('authorization') : headers.authorization || headers.Authorization;
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header || '');
  if (!match || match[1].length > 10000) fail(401, 'Sign in to continue.');
  return match[1];
}
function jwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { return null; }
}
function isSecret(key) {
  return key.startsWith('sb_secret_') || jwtPayload(key)?.role === 'service_role';
}
// Verified tokens are remembered briefly so a page load (feed, profile, photos)
// costs one /auth/v1/user round trip instead of one per request. Supabase's data
// API accepts the same JWT until it expires, so this widens no access: it only
// skips repeat lookups. Entries never outlive the token's own expiry.
const VERIFIED_TTL_MS = 60_000;
const VERIFIED_MAX = 500;

export function createSocialApi({ url, key, fetcher = fetch } = {}) {
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) for accounts and shared cookbooks.');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('SUPABASE_URL must be the HTTPS project URL.');
  if (isSecret(key)) throw new Error('Use a Supabase publishable or anon key, never a service-role or secret key, for the social app.');
  const credentials = new WeakMap();
  const verified = new Map();

  async function request(path, { token, method = 'GET', body, headers = {}, binary = false } = {}) {
    let response;
    try {
      response = await fetcher(new URL(path, origin), {
        method, signal: AbortSignal.timeout(15000),
        headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined || Buffer.isBuffer(body) ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      });
    } catch { fail(503, 'The cookbook service is unavailable. Please try again.'); }
    if (response.status === 401 && token) verified.delete(token);
    if (!response.ok) {
      let detail = {}; try { detail = await response.json(); } catch { /* Upstream error bodies are optional. */ }
      const message = String(detail.msg || detail.message || detail.error_description || detail.error || '');
      if (detail.code === '23505' || /username.*already|duplicate.*username/i.test(message)) fail(409, 'That username or item is already in use.');
      if (detail.code === '23503') fail(400, 'An item changed or no longer exists. Refresh and try again.');
      if (detail.code === 'P0002' || response.status === 404) fail(404, /username/i.test(message) ? 'Username not found.' : 'Item not found.');
      if (detail.code === '42501' || response.status === 403) fail(403, 'You do not have permission to make that change.');
      if (detail.code === '22023' || detail.code === '23514') fail(400, detail.code === '22023' ? message.slice(0, 200) : 'Check the recipe, rating or cookbook fields.');
      if (response.status === 429) fail(429, 'Too many attempts. Please wait before trying again.');
      if (/email.*not confirmed/i.test(message)) fail(401, 'Confirm your email before signing in.');
      if (/email.*not allowed|email.*not authorized|only.*authorized|email.*rate limit|sending.*email/i.test(message)) fail(503, 'Email delivery needs to be configured in Supabase Auth. Check the hosting guide.');
      if (response.status === 401 || /invalid.*credentials|invalid.*refresh|refresh.*not found|refresh.*expired/i.test(message)) fail(401, path.includes('/token?grant_type=password') ? 'That email or password did not match.' : 'Your session expired. Please sign in again.');
      if (path.startsWith('/auth/') && response.status < 500) fail(400, message.slice(0, 180) || 'Check your account details and try again.');
      if (path.startsWith('/auth/') && /database error saving new user/i.test(message)) fail(409, 'That username may already be in use, or account setup is incomplete. Try another username and check the hosting setup.');
      fail(503, 'The cookbook service could not complete this request. Check the hosting setup or try again.');
    }
    if (binary) return { data: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'image/webp' };
    if (response.status === 204 || response.headers.get('content-length') === '0') return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rest = (table, token, options = {}) => request(`/rest/v1/${table}`, { token, ...options });
  const rpc = (name, token, body) => rest(`rpc/${name}`, token, { method: 'POST', body });
  async function verify(token) {
    const user = await request('/auth/v1/user', { token });
    if (!user?.id || !UUID.test(user.id)) fail(401, 'Your session expired. Please sign in again.');
    credentials.set(user, token);
    return user;
  }
  function authenticate(headers) {
    let token;
    try { token = tokenFrom(headers); } catch (error) { return Promise.reject(error); }
    const now = Date.now();
    const cached = verified.get(token);
    if (cached && cached.until > now) return cached.user;
    if (cached) verified.delete(token);
    const expiry = Number(jwtPayload(token)?.exp) * 1000;
    // Only real JWTs with a future expiry are cached; anything else is checked every time.
    if (!(expiry > now)) return verify(token);
    if (verified.size >= VERIFIED_MAX) {
      for (const [key, entry] of verified) if (entry.until <= now) verified.delete(key);
      while (verified.size >= VERIFIED_MAX) verified.delete(verified.keys().next().value);
    }
    // Concurrent requests with the same token share one in-flight check.
    const user = verify(token);
    verified.set(token, { user, until: Math.min(now + VERIFIED_TTL_MS, expiry) });
    user.catch(() => { if (verified.get(token)?.user === user) verified.delete(token); });
    return user;
  }
  function credential(user) { const token = credentials.get(user); if (!token) fail(401, 'Sign in to continue.'); return token; }
  async function one(table, token, options, required = true) {
    const rows = await rest(table, token, options);
    if (!rows?.length && required) fail(404, 'Item not found, or you do not have access.');
    return rows?.[0] || null;
  }
  const representation = { Prefer: 'return=representation' };
  async function putPhoto(user, photo) {
    const token = credential(user); id(photo.id);
    if (!Buffer.isBuffer(photo.data) || photo.data.length > 1500000) fail(400, 'Choose a valid recipe photo.');
    const path = `${user.id}/${photo.id}.webp`;
    await one('social_photos', token, { method: 'POST', headers: representation, body: { id: photo.id, owner_id: user.id, path } });
    try {
      await request(`/storage/v1/object/social-recipe-photos/${path}`, { token, method: 'POST', headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false' }, body: photo.data });
    } catch (error) {
      try { await rest(`social_photos?id=eq.${photo.id}`, token, { method: 'DELETE' }); } catch { /* Safe private draft if cleanup is unavailable. */ }
      throw error;
    }
    return photo.id;
  }
  async function getPhoto(headers, photoId) {
    id(photoId); const user = await authenticate(headers); const token = credential(user);
    const photo = await one(`social_photos?id=eq.${photoId}&select=path&limit=1`, token, {}, false);
    if (!photo) return null;
    return request(`/storage/v1/object/authenticated/social-recipe-photos/${photo.path}`, { token, binary: true });
  }
  async function removePhoto(user, photoId) {
    id(photoId); const token = credential(user);
    // Delete metadata first. RLS allows only the uploader's unattached photos;
    // the recipe FK prevents a concurrent save from attaching a deleted draft.
    const photo = await one(`social_photos?id=eq.${photoId}`, token, { method: 'DELETE', headers: representation }, false);
    if (!photo) return false;
    await request('/storage/v1/object/social-recipe-photos', { token, method: 'DELETE', body: { prefixes: [photo.path] } });
    return true;
  }

  function recipeRow(recipe) {
    const { imageId, sourceUrl, sourceCaloriesPerServing, meatType, ...fields } = recipe;
    return { ...fields, meat_type: meatType, image_id: imageId || null, source_url: sourceUrl, source_calories: sourceCaloriesPerServing };
  }
  function encodeCookbook(input, partial = false) {
    object(input); const data = {};
    if (!partial || 'name' in input) data.name = string(input.name, 'Cookbook name', 100);
    if (!partial || 'description' in input) data.description = string(input.description, 'Description', 1000, true);
    if (!partial || 'visibility' in input) { data.visibility = input.visibility || 'private'; if (!['public', 'friends', 'private'].includes(data.visibility)) fail(400, 'Choose public, friends or private visibility.'); }
    if ('coverImageId' in input) data.cover_image_id = input.coverImageId ? id(input.coverImageId) : null;
    if ('coverColor' in input) { if (!COLORS.includes(input.coverColor)) fail(400, 'Choose a valid cookbook color.'); data.cover_color = input.coverColor; }
    if (!Object.keys(data).length) fail(400, 'Choose a field to update.');
    return data;
  }
  async function feed(token) {
    const names = ['profiles?select=*&order=username&limit=200', 'cookbook_stats?select=*&order=created_at.desc&limit=100', 'recipe_stats?select=*&order=created_at.desc&limit=300', 'friendships?select=*&limit=200', 'cookbook_follows?select=*&limit=200', 'recipe_reviews?select=*&order=created_at.desc&limit=1000', 'review_replies?select=*&order=created_at.asc&limit=1000'];
    // All eight reads are independent; issue them together.
    const [profiles, cookbooks, recipes, friendships, follows, reviews, replies, memberships] = await Promise.all([...names.map(name => rest(name, token)), rpc('cookbook_my_memberships', token, {})]);
    return decodeSocial({ profiles, cookbooks, recipes, friendships, follows, reviews, replies, memberships });
  }
  async function handle({ method = 'GET', pathname, query = new URLSearchParams(), headers = {}, body } = {}) {
    if (!pathname?.startsWith('/api/social/')) return null;
    const path = pathname.slice('/api/social'.length);
    if (path === '/config' && method === 'GET') return { status: 200, body: { configured: true, authRequired: true, nutritionEnabled: false, appName: APP_NAME } };
    if (path === '/auth/signup' && method === 'POST') {
      const input = object(body); const name = username(input.username);
      const email = string(input.email, 'Email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
      const password = string(input.password, 'Password', 128); if (password.length < 8) fail(400, 'Use a password with at least 8 characters.');
      const result = await request('/auth/v1/signup', { method: 'POST', body: { email, password, data: { username: name, display_name: string(input.displayName || name, 'Display name', 80) } } });
      return { status: 201, body: { session: session(result), confirmationRequired: !result.access_token, message: result.access_token ? 'Your account is ready.' : 'Check your email to confirm your account before signing in.' } };
    }
    if (path === '/auth/login' && method === 'POST') {
      const input = object(body);
      const result = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: string(input.email, 'Email', 254).toLowerCase(), password: string(input.password, 'Password', 128) } });
      return { status: 200, body: { session: session(result), confirmationRequired: false } };
    }
    if (path === '/auth/refresh' && method === 'POST') {
      const input = object(body);
      const result = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: string(input.refreshToken, 'Session', 1000) } });
      return { status: 200, body: { session: session(result) } };
    }
    const user = await authenticate(headers); const token = credential(user);
    let result; let status = 200; let match;
    if (path === '/auth/logout' && method === 'POST') { verified.delete(token); await request('/auth/v1/logout', { token, method: 'POST' }); result = { signedOut: true }; }
    else if (path === '/me' && method === 'GET') result = { user: { id: user.id, email: user.email }, profile: await one(`profiles?id=eq.${user.id}&limit=1`, token) };
    else if (path === '/profile' && ['PUT', 'PATCH'].includes(method)) {
      const input = object(body); const data = {};
      if ('username' in input) data.username = username(input.username);
      if ('displayName' in input) data.display_name = string(input.displayName, 'Display name', 80);
      if ('bio' in input) data.bio = string(input.bio, 'Bio', 500, true);
      if (!Object.keys(data).length) fail(400, 'Choose a field to update.');
      result = await one(`profiles?id=eq.${user.id}`, token, { method: 'PATCH', headers: representation, body: data });
    }
    else if (path === '/feed' && method === 'GET') result = await feed(token);
    else if (path === '/search' && method === 'GET') {
      const get = key => typeof query.get === 'function' ? query.get(key) || '' : query[key] || '';
      const category = get('category'), protein = get('meatType');
      if (category && !CATEGORIES.includes(category)) fail(400, 'Choose a valid recipe category.');
      if (protein && !PROTEINS.includes(protein)) fail(400, 'Choose a valid meat or protein type.');
      result = await rpc('cookbook_search', token, { search_text: string(get('q'), 'Search', 120, true), meal_category: category, protein, recipe_tag: string(get('tag'), 'Recipe label', 40, true).toLowerCase() });
    }
    else if (path === '/cookbooks' && method === 'GET') result = await rest('cookbook_stats?select=*&order=created_at.desc&limit=100', token);
    else if (path === '/cookbooks' && method === 'POST') { result = await one('cookbooks', token, { method: 'POST', headers: representation, body: { ...encodeCookbook(body), owner_id: user.id } }); status = 201; }
    else if ((match = path.match(/^\/cookbooks\/([^/]+)$/))) {
      const book = id(match[1]);
      if (method === 'GET') result = await one(`cookbook_stats?id=eq.${book}&limit=1`, token);
      else if (['PUT', 'PATCH'].includes(method)) result = await one(`cookbooks?id=eq.${book}`, token, { method: 'PATCH', headers: representation, body: encodeCookbook(body, true) });
      else if (method === 'DELETE') { await one(`cookbooks?id=eq.${book}`, token, { method: 'DELETE', headers: representation }); result = { deleted: true }; }
      else fail(405, 'Method not allowed.');
    }
    else if ((match = path.match(/^\/cookbooks\/([^/]+)\/invite$/)) && method === 'POST') { result = await rpc('cookbook_invite_partner', token, { book: id(match[1]), partner_username: username(object(body).username) }); status = 201; }
    else if ((match = path.match(/^\/invitations\/([^/]+)\/accept$/)) && method === 'POST') result = await rpc('cookbook_accept_invitation', token, { invitation: id(match[1]) });
    else if ((match = path.match(/^\/memberships\/([^/]+)$/)) && method === 'DELETE') { await one(`cookbook_members?id=eq.${id(match[1])}`, token, { method: 'DELETE', headers: representation }); result = { deleted: true }; }
    else if ((match = path.match(/^\/cookbooks\/([^/]+)\/follow$/))) {
      const book = id(match[1]);
      if (method === 'PUT' || method === 'POST') result = await one('cookbook_follows?on_conflict=user_id,cookbook_id', token, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: { user_id: user.id, cookbook_id: book } }, false) || { user_id: user.id, cookbook_id: book };
      else if (method === 'DELETE') { await rest(`cookbook_follows?user_id=eq.${user.id}&cookbook_id=eq.${book}`, token, { method: 'DELETE' }); result = { deleted: true }; }
      else fail(405, 'Method not allowed.');
    }
    else if ((match = path.match(/^\/cookbooks\/([^/]+)\/planner$/))) {
      const book = id(match[1]);
      if (method === 'GET') {
        const rows = await rpc('cookbook_get_planner', token, { book });
        if (!rows?.length) fail(404, 'Item not found, or you do not have access.');
        result = { ...rows[0].state, version: rows[0].version };
      }
      else if (method === 'PUT') {
        const plan = checked(() => validateMealPlan(body));
        const rows = await rpc('cookbook_save_planner', token, { book, new_state: { cart: plan.cart, checked: plan.checked }, expected_version: plan.version });
        if (!rows?.length) fail(409, 'The shopping list changed on another device. Refresh and try again.');
        result = { ...rows[0].state, version: rows[0].version };
      } else fail(405, 'Method not allowed.');
    }
    else if (path === '/recipes' && method === 'GET') {
      const book = typeof query.get === 'function' ? query.get('cookbookId') : query.cookbookId;
      result = await rest(`recipe_stats?select=*&order=created_at.desc&limit=300${book ? `&cookbook_id=eq.${id(book)}` : ''}`, token);
    }
    else if (path === '/recipes' && method === 'POST') { const input = object(body); result = await one('cookbook_recipes', token, { method: 'POST', headers: representation, body: { ...recipeRow(checked(() => validateSocialRecipe(input))), cookbook_id: id(input.cookbookId), author_id: user.id } }); status = 201; }
    else if ((match = path.match(/^\/recipes\/([^/]+)$/))) {
      const recipeId = id(match[1]);
      if (method === 'GET') result = await one(`recipe_stats?id=eq.${recipeId}&limit=1`, token);
      else if (method === 'PUT') {
        const previous = await one(`cookbook_recipes?id=eq.${recipeId}&limit=1`, token);
        const input = object(body); const recipe = checked(() => reviseRecipe(previous, validateSocialRecipe(input)));
        if (input.cookbookId && input.cookbookId !== previous.cookbook_id) fail(400, 'A recipe stays in its original cookbook. Copy it into another cookbook instead.');
        result = await one(`cookbook_recipes?id=eq.${recipeId}`, token, { method: 'PATCH', headers: representation, body: recipeRow(recipe) });
      } else if (method === 'DELETE') { await one(`cookbook_recipes?id=eq.${recipeId}`, token, { method: 'DELETE', headers: representation }); result = { deleted: true }; }
      else fail(405, 'Method not allowed.');
    }
    else if ((match = path.match(/^\/recipes\/([^/]+)\/review$/))) {
      const recipeId = id(match[1]);
      if (['POST', 'PUT'].includes(method)) {
        const input = object(body); if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) fail(400, 'Choose a rating from 1 to 5.');
        const data = { rating: input.rating, comment: string(input.comment, 'Review', 2000) };
        const existing = await one(`recipe_reviews?recipe_id=eq.${recipeId}&user_id=eq.${user.id}&limit=1`, token, {}, false);
        // Update only rating/comment: ownership and recipe cannot be reassigned.
        result = existing ? await one(`recipe_reviews?id=eq.${existing.id}`, token, { method: 'PATCH', headers: representation, body: data }) : await one('recipe_reviews', token, { method: 'POST', headers: representation, body: { ...data, recipe_id: recipeId, user_id: user.id } });
      } else if (method === 'DELETE') { await rest(`recipe_reviews?recipe_id=eq.${recipeId}&user_id=eq.${user.id}`, token, { method: 'DELETE' }); result = { deleted: true }; }
      else fail(405, 'Method not allowed.');
    }
    else if ((match = path.match(/^\/reviews\/([^/]+)\/replies$/)) && method === 'POST') { result = await one('review_replies', token, { method: 'POST', headers: representation, body: { review_id: id(match[1]), user_id: user.id, comment: string(object(body).comment, 'Reply', 2000) } }); status = 201; }
    else if ((match = path.match(/^\/replies\/([^/]+)$/)) && method === 'DELETE') { await one(`review_replies?id=eq.${id(match[1])}`, token, { method: 'DELETE', headers: representation }); result = { deleted: true }; }
    else if (path === '/friends' && method === 'GET') result = await rest('friendships?select=*&order=created_at.desc&limit=200', token);
    else if (path === '/friends' && method === 'POST') {
      const name = username(object(body).username);
      const target = await one(`profiles?username=eq.${name}&select=id&limit=1`, token, {}, false);
      if (!target) fail(404, 'Username not found.');
      if (target.id === user.id) fail(400, 'Choose another person to add as a friend.');
      result = await one('friendships', token, { method: 'POST', headers: representation, body: { requester_id: user.id, addressee_id: target.id } }); status = 201;
    }
    else if ((match = path.match(/^\/friends\/([^/]+)\/accept$/)) && method === 'POST') result = await rpc('cookbook_accept_friendship', token, { friendship: id(match[1]) });
    else if ((match = path.match(/^\/friends\/([^/]+)$/)) && method === 'DELETE') { await one(`friendships?id=eq.${id(match[1])}`, token, { method: 'DELETE', headers: representation }); result = { deleted: true }; }
    else fail(404, 'Endpoint not found.');
    return { status, body: decodeSocial(result) };
  }
  return { handle, authenticate, putPhoto, getPhoto, removePhoto };
}
