import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSocialApi, decodeSocial } from '../social-api.js';

const USER = '11111111-1111-4111-8111-111111111111';
const BOOK = '22222222-2222-4222-8222-222222222222';
const RECIPE = '33333333-3333-4333-8333-333333333333';
const PHOTO = '44444444-4444-4444-8444-444444444444';
const REVIEW = '55555555-5555-4555-8555-555555555555';
const headers = { authorization: 'Bearer signed.user.token' };
function fixture(overrides = {}) {
  return { cookbookId: BOOK, title: 'Tomato rice', description: '', category: 'Dinner', diet: 'Vegan', meatType: 'Vegetarian', tags: ['weeknight'], servings: 2, minutes: 25, ingredients: [{ name: 'Rice', quantity: 200, unit: 'g' }], instructions: ['Cook the rice.'], ...overrides };
}
function harness(handler = () => []) {
  const calls = [];
  const api = createSocialApi({ url: 'https://example.supabase.co', key: 'sb_publishable_test', fetcher: async (url, options) => {
    const call = { url: String(url), path: url.pathname, query: url.searchParams, ...options, input: options.body && !Buffer.isBuffer(options.body) ? JSON.parse(options.body) : options.body };
    calls.push(call);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: USER, email: 'luka@example.com' });
    const value = await handler(call);
    return value instanceof Response ? value : Response.json(value);
  } });
  const invoke = (pathname, method = 'GET', body, query = new URLSearchParams()) => api.handle({ method, pathname: `/api/social${pathname}`, headers, body, query });
  return { api, calls, invoke };
}

test('social configuration is public but collection data requires a verified bearer token', async () => {
  const { api, calls } = harness();
  assert.equal((await api.handle({ method: 'GET', pathname: '/api/social/config' })).body.authRequired, true);
  assert.equal(calls.length, 0);
  await assert.rejects(api.handle({ method: 'GET', pathname: '/api/social/feed' }), { status: 401 });
  assert.equal(calls.length, 0);
  assert.equal(await api.handle({ method: 'GET', pathname: '/api/legacy' }), null);
});

test('social adapter rejects service-role, secret, insecure and malformed project configuration', () => {
  const service = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`;
  for (const key of ['sb_secret_test', service]) assert.throws(() => createSocialApi({ url: 'https://example.supabase.co', key }), /never a service-role/);
  for (const url of ['http://example.com', 'https://example.com/rest/', 'https://example.com?key=x', 'https://user:pass@example.com']) assert.throws(() => createSocialApi({ url, key: 'public' }), /HTTPS project URL/);
});

test('signup preserves confirmation-required flow and normalizes a unique public username', async () => {
  const { invoke, calls } = harness(() => ({ user: { id: USER } }));
  const result = await invoke('/auth/signup', 'POST', { email: ' Luka@Example.com ', password: 'reallygoodpassword', username: 'LUKA_1', displayName: 'Luka' });
  assert.equal(result.status, 201);
  assert.equal(result.body.session, null);
  assert.equal(result.body.confirmationRequired, true);
  assert.deepEqual(calls[0].input.data, { username: 'luka_1', display_name: 'Luka' });
  assert.equal(calls[0].headers.Authorization, undefined);
  await assert.rejects(invoke('/auth/signup', 'POST', { email: 'x@y.z', password: 'short', username: 'okname' }), { status: 400 });
  assert.equal(calls.length, 1);
});

test('login and refresh return portable sessions; failed credentials and SMTP setup have clear messages', async () => {
  const { invoke, calls } = harness(call => call.input.password === 'badpassword' ? Response.json({ msg: 'Invalid login credentials' }, { status: 400 }) : { access_token: 'new.access.token', refresh_token: 'newrefresh', expires_at: 123456, user: { id: USER } });
  const login = await invoke('/auth/login', 'POST', { email: 'luka@example.com', password: 'validpassword' });
  assert.equal(login.body.session.accessToken, 'new.access.token');
  assert.equal(login.body.session.expiresAt, 123456);
  assert.equal((await invoke('/auth/refresh', 'POST', { refreshToken: 'oldrefresh' })).body.session.refreshToken, 'newrefresh');
  assert.match(calls[1].url, /grant_type=refresh_token/);
  await assert.rejects(invoke('/auth/login', 'POST', { email: 'luka@example.com', password: 'badpassword' }), { status: 401, message: 'That email or password did not match.' });
  const smtp = harness(() => Response.json({ msg: 'Email address not authorized' }, { status: 400 }));
  await assert.rejects(smtp.invoke('/auth/signup', 'POST', { email: 'luka@example.com', password: 'validpassword', username: 'luka' }), error => error.status === 503 && /Email delivery/.test(error.message));
});

test('signed-in recipe creation fixes author to JWT user and uses only public key plus their token', async () => {
  const { invoke, calls } = harness(call => [{ id: RECIPE, ...call.input }]);
  const result = await invoke('/recipes', 'POST', fixture({ authorId: 'someone-else', tags: ['Weeknight', 'weeknight'] }));
  assert.equal(result.status, 201);
  assert.equal(result.body.authorId, USER);
  assert.equal(result.body.cookbookId, BOOK);
  assert.equal(result.body.meatType, 'Vegetarian');
  assert.deepEqual(result.body.tags, ['weeknight']);
  assert.equal(calls[1].input.author_id, USER);
  assert.equal(calls[1].input.authorId, undefined);
  for (const call of calls) { assert.equal(call.headers.apikey, 'sb_publishable_test'); assert.equal(call.headers.Authorization, headers.authorization); }
});

test('recipe category/protein/tag validation rejects invalid content before database writes', async () => {
  const { invoke, calls } = harness();
  for (const overrides of [{ category: 'Special' }, { meatType: 'Alien' }, { tags: Array(13).fill('x') }, { cookbookId: '1' }, { ingredients: [] }]) await assert.rejects(invoke('/recipes', 'POST', fixture(overrides)), { status: 400 });
  assert.equal(calls.filter(call => call.path !== '/auth/v1/user').length, 0);
});

test('recipe edits cannot move books and invalidate published calories when quantities change', async () => {
  const original = { id: RECIPE, cookbook_id: BOOK, servings: 2, ingredients: fixture().ingredients };
  const { invoke, calls } = harness(call => call.method === 'GET' ? [original] : [{ ...original, ...call.input }]);
  await assert.rejects(invoke(`/recipes/${RECIPE}`, 'PUT', fixture({ cookbookId: PHOTO })), { status: 400 });
  const result = await invoke(`/recipes/${RECIPE}`, 'PUT', fixture({ servings: 4, sourceUrl: 'https://example.com/recipe', sourceCaloriesPerServing: 123 }));
  assert.equal(result.body.sourceCaloriesPerServing, null);
  assert.equal(calls.at(-1).input.source_calories, null);
  assert.equal(calls.at(-1).input.cookbook_id, undefined);
});

test('reviews use exactly one own review, preserve ownership and enforce 1–5 grades', async () => {
  const { invoke, calls } = harness(call => call.method === 'GET' ? [{ id: REVIEW, user_id: USER, recipe_id: RECIPE }] : [{ id: REVIEW, ...call.input }]);
  const result = await invoke(`/recipes/${RECIPE}/review`, 'PUT', { rating: 5, comment: 'Lovely dinner!', userId: PHOTO, recipeId: PHOTO });
  assert.equal(result.body.rating, 5);
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.deepEqual(calls.at(-1).input, { rating: 5, comment: 'Lovely dinner!' });
  for (const rating of [0, 6, 1.5, '5']) await assert.rejects(invoke(`/recipes/${RECIPE}/review`, 'PUT', { rating, comment: 'Hi' }), { status: 400 });
});

test('RLS denial becomes permission error instead of bypassing the current user', async () => {
  const { invoke, calls } = harness(() => Response.json({ code: '42501', message: 'new row violates row-level security policy' }, { status: 403 }));
  await assert.rejects(invoke('/cookbooks', 'POST', { name: 'Our book', ownerId: PHOTO }), { status: 403 });
  assert.equal(calls.at(-1).input.owner_id, USER);
});

test('search sends literal text and combined category, protein and label criteria to invoker RPC', async () => {
  const { invoke, calls } = harness(() => ({ profiles: [], cookbooks: [], recipes: [] }));
  await invoke('/search', 'GET', undefined, new URLSearchParams({ q: "100% Oats' OR 1=1", category: 'Breakfast', meatType: 'Vegetarian', tag: 'Quick' }));
  assert.deepEqual(calls.at(-1).input, { search_text: "100% Oats' OR 1=1", meal_category: 'Breakfast', protein: 'Vegetarian', recipe_tag: 'quick' });
});

test('feed includes aggregated stars and invitations without leaking auth metadata', async () => {
  const { invoke } = harness(call => call.path.endsWith('/cookbook_my_memberships') ? [{ cookbook_id: BOOK, user_id: USER, cookbook_name: 'Our cookbook', status: 'invited' }] : call.path.endsWith('/cookbook_stats') ? [{ id: BOOK, owner_id: USER, rating: 4.5, review_count: 2, recipe_count: 1 }] : []);
  const result = await invoke('/feed');
  assert.equal(result.body.cookbooks[0].reviewCount, 2);
  assert.equal(result.body.cookbooks[0].rating, 4.5);
  assert.equal(result.body.memberships[0].cookbookName, 'Our cookbook');
  assert.equal(result.body.accessToken, undefined);
});

test('shared shopping list uses compare-and-swap version and preserves checkbox keys', async () => {
  const { invoke, calls } = harness(call => [{ state: call.input.new_state, version: 8 }]);
  const result = await invoke(`/cookbooks/${BOOK}/planner`, 'PUT', { cart: [{ recipeId: RECIPE, servings: 4 }], checked: { rice_g: true }, version: 7 });
  assert.equal(calls.at(-1).input.expected_version, 7);
  assert.deepEqual(result.body.checked, { rice_g: true });
  assert.equal(result.body.version, 8);
  const stale = harness(() => []);
  await assert.rejects(stale.invoke(`/cookbooks/${BOOK}/planner`, 'PUT', { cart: [], checked: {}, version: 0 }), { status: 409 });
  await assert.rejects(invoke(`/cookbooks/${BOOK}/planner`, 'PUT', { cart: [{ recipeId: RECIPE, servings: 4 }, { recipeId: RECIPE, servings: 2 }], checked: {}, version: 7 }), { status: 400 });
});

test('planner reads use visibility-filtering RPC and preserve canonical external recipe references', async () => {
  const state = { cart: [{ recipeId: RECIPE, servings: 3 }], checked: {} };
  const { invoke, calls } = harness(() => [{ state, version: 9 }]);
  const result = await invoke(`/cookbooks/${BOOK}/planner`);
  assert.deepEqual(result.body, { ...state, version: 9 });
  assert.equal(calls.at(-1).path, '/rest/v1/rpc/cookbook_get_planner');
  assert.deepEqual(calls.at(-1).input, { book: BOOK });
  assert.equal(calls.some(call => call.path === '/rest/v1/cookbook_planners'), false);
  const missing = harness(() => []);
  await assert.rejects(missing.invoke(`/cookbooks/${BOOK}/planner`), { status: 404 });
});

test('planner rejects recipes hidden from a partner with an actionable shared-visibility message', async () => {
  const { invoke } = harness(() => Response.json({ code: '22023', message: 'Choose recipes that everyone in this cookbook can view.' }, { status: 400 }));
  await assert.rejects(invoke(`/cookbooks/${BOOK}/planner`, 'PUT', { cart: [{ recipeId: RECIPE, servings: 2 }], checked: {}, version: 0 }), { status: 400, message: 'Choose recipes that everyone in this cookbook can view.' });
});

test('photo upload scopes object paths to verified user; helpers reject forged user objects', async () => {
  const { api, calls } = harness(call => call.path.endsWith('/social_photos') ? [{ ...call.input }] : { Key: 'uploaded' });
  await assert.rejects(api.putPhoto({ id: USER }, { id: PHOTO, data: Buffer.from('image') }), { status: 401 });
  const user = await api.authenticate(headers);
  assert.equal(await api.putPhoto(user, { id: PHOTO, data: Buffer.from('image') }), PHOTO);
  assert.equal(calls[1].input.path, `${USER}/${PHOTO}.webp`);
  assert.match(calls[2].path, new RegExp(`social-recipe-photos/${USER}/${PHOTO}\\.webp$`));
  assert.equal(calls[2].headers['x-upsert'], 'false');
});

test('private unreadable photos return no object; attached or foreign photos cannot be deleted', async () => {
  const { api, calls } = harness(() => []);
  assert.equal(await api.getPhoto(headers, PHOTO), null);
  assert.equal(calls.filter(call => call.path.includes('/storage/')).length, 0);
  const user = await api.authenticate(headers);
  assert.equal(await api.removePhoto(user, PHOTO), false);
  assert.equal(calls.filter(call => call.path.includes('/storage/')).length, 0);
});

test('photo deletion removes RLS-approved metadata before deleting its own storage path', async () => {
  const { api, calls } = harness(call => call.path.endsWith('/social_photos') ? [{ id: PHOTO, owner_id: USER, path: `${USER}/${PHOTO}.webp` }] : []);
  const user = await api.authenticate(headers);
  assert.equal(await api.removePhoto(user, PHOTO), true);
  assert.equal(calls[1].method, 'DELETE');
  assert.deepEqual(calls[2].input.prefixes, [`${USER}/${PHOTO}.webp`]);
});

test('verified sessions are reused briefly, never past token expiry, and dropped on sign-out or upstream 401', async () => {
  const jwt = exp => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: USER, exp })).toString('base64url')}.signature`;
  const live = { authorization: `Bearer ${jwt(Math.floor(Date.now() / 1000) + 3600)}` };
  let rejectData = false;
  const { api, calls } = harness(() => rejectData ? Response.json({ msg: 'JWT expired' }, { status: 401 }) : []);
  const userChecks = () => calls.filter(call => call.path === '/auth/v1/user').length;
  await Promise.all([api.handle({ method: 'GET', pathname: '/api/social/friends', headers: live }), api.handle({ method: 'GET', pathname: '/api/social/cookbooks', headers: live })]);
  await api.getPhoto(live, PHOTO);
  assert.equal(userChecks(), 1, 'concurrent and follow-up requests share one verification');
  rejectData = true;
  await assert.rejects(api.handle({ method: 'GET', pathname: '/api/social/friends', headers: live }), { status: 401 });
  rejectData = false;
  await api.handle({ method: 'GET', pathname: '/api/social/friends', headers: live });
  assert.equal(userChecks(), 2, 'an upstream 401 forces re-verification');
  await api.handle({ method: 'POST', pathname: '/api/social/auth/logout', headers: live });
  await api.handle({ method: 'GET', pathname: '/api/social/friends', headers: live });
  assert.equal(userChecks(), 3, 'sign-out forgets the token');
  const expired = { authorization: `Bearer ${jwt(Math.floor(Date.now() / 1000) - 10)}` };
  await api.authenticate(expired); await api.authenticate(expired);
  assert.equal(userChecks(), 5, 'expired or non-JWT tokens are always checked upstream');
});

test('camel-case decoding leaves recipe JSON and shopping-list map keys intact', () => {
  const result = decodeSocial({ source_calories: 200, meat_type: 'Beef', checked: { tomato_g: true }, ingredients: [{ name: 'Rice', arbitrary_note: 'literal' }] });
  assert.deepEqual(result, { sourceCaloriesPerServing: 200, meatType: 'Beef', checked: { tomato_g: true }, ingredients: [{ name: 'Rice', arbitrary_note: 'literal' }] });
});

test('schema declares RLS for every data table, secure stats, rating uniqueness and restricted photos', async () => {
  const sql = await readFile(new URL('../hosting/social-schema.sql', import.meta.url), 'utf8');
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map(match => match[1]);
  assert.equal(tables.length, 11);
  for (const table of tables) assert.ok(sql.includes(`alter table public.${table} enable row level security;`), `${table} has RLS`);
  assert.match(sql, /unique\(recipe_id,user_id\)/);
  assert.match(sql, /rating integer not null check\(rating between 1 and 5\)/);
  assert.match(sql, /create view public\.cookbook_stats with \(security_invoker=true\)/);
  assert.match(sql, /avg\(v\.rating\)/);
  assert.match(sql, /not public\.cookbook_is_member\(r\.cookbook_id\)/);
  assert.match(sql, /delete from public\.recipe_reviews v using public\.cookbook_recipes r/);
  assert.match(sql, /'social-recipe-photos','social-recipe-photos',false/);
  assert.match(sql, /\(public\.cookbook_storage_owned\(name\) or public\.cookbook_storage_orphaned\(name\)\) and public\.cookbook_storage_unattached\(name\)/);
  assert.match(sql, /create function public\.delete_my_account\(\) returns jsonb\s+language plpgsql security definer set search_path = ''/);
  assert.doesNotMatch(sql, /grant update\([^\n]*\) on public\.cookbook_planners/);
});

test('account deletion re-checks username and password before the database function runs', async () => {
  const outcome = { password: 'rightpassword' };
  const { invoke, calls } = harness(call => {
    if (call.path === '/rest/v1/profiles') return [{ username: 'luka' }];
    if (call.path === '/auth/v1/token') return call.input.password === outcome.password ? { access_token: 'fresh.token', user: { id: USER } } : Response.json({ msg: 'Invalid login credentials' }, { status: 400 });
    if (call.path === '/rest/v1/rpc/delete_my_account') return [`${USER}/${PHOTO}.webp`];
    return [];
  });
  const destructive = () => calls.filter(call => call.path.endsWith('/delete_my_account') || call.path.includes('/storage/'));
  await assert.rejects(invoke('/account/delete', 'POST', { username: 'someoneelse', password: 'rightpassword' }), { status: 400, message: /username exactly/ });
  assert.equal(calls.some(call => call.path === '/auth/v1/token'), false, 'A wrong username never tries the password');
  await assert.rejects(invoke('/account/delete', 'POST', { username: 'luka', password: 'wrongpassword' }), { status: 400, message: 'That password did not match. Nothing was deleted.' });
  await assert.rejects(invoke('/account/delete', 'POST', { username: 'luka' }), { status: 400 });
  assert.deepEqual(destructive(), []);

  const result = await invoke('/account/delete', 'POST', { username: ' @Luka ', password: 'rightpassword' });
  assert.deepEqual(result.body, { deleted: true, photosRemoved: true });
  const check = calls.filter(call => call.path === '/auth/v1/token').at(-1);
  assert.match(check.url, /grant_type=password/);
  assert.deepEqual(check.input, { email: 'luka@example.com', password: 'rightpassword' }, 'The password is checked against the signed-in user’s own email');
  const [rpc, storage] = destructive();
  assert.equal(rpc.headers.Authorization, headers.authorization);
  assert.deepEqual(rpc.input, {});
  assert.equal(storage.method, 'DELETE');
  assert.equal(storage.headers.Authorization, headers.authorization);
  assert.deepEqual(storage.input.prefixes, [`${USER}/${PHOTO}.webp`]);
});

test('account deletion still succeeds when photo files cannot be removed afterwards', async () => {
  const { invoke } = harness(call => {
    if (call.path === '/rest/v1/profiles') return [{ username: 'luka' }];
    if (call.path === '/auth/v1/token') return { access_token: 'fresh.token' };
    if (call.path.endsWith('/delete_my_account')) return [`${USER}/${PHOTO}.webp`];
    return Response.json({ message: 'unavailable' }, { status: 500 });
  });
  const errors = []; const original = console.error; console.error = message => errors.push(message);
  try { assert.deepEqual((await invoke('/account/delete', 'POST', { username: 'luka', password: 'rightpassword' })).body, { deleted: true, photosRemoved: false }); }
  finally { console.error = original; }
  assert.equal(errors.length, 1);
});

test('reports validate their fields, use the caller’s token and explain duplicates and unreadable targets', async () => {
  let reply = call => [{ id: REVIEW, ...call.input }];
  const { invoke, calls } = harness(call => reply(call));
  const result = await invoke('/reports', 'POST', { targetType: 'recipe', targetId: RECIPE, reason: 'copyright', note: ' From my blog. ', reporterId: PHOTO });
  assert.equal(result.status, 201);
  assert.deepEqual(calls.at(-1).input, { target_type: 'recipe', target_id: RECIPE, reason: 'copyright', note: 'From my blog.' }, 'reporter_id is left to the database default');
  for (const input of [{ targetType: 'user', targetId: RECIPE, reason: 'spam' }, { targetType: 'recipe', targetId: 'x', reason: 'spam' }, { targetType: 'recipe', targetId: RECIPE, reason: 'meh' }, { targetType: 'recipe', targetId: RECIPE, reason: 'spam', note: 'x'.repeat(501) }]) {
    await assert.rejects(invoke('/reports', 'POST', input), { status: 400 });
  }
  reply = () => Response.json({ code: '23505', message: 'duplicate key value violates unique constraint' }, { status: 409 });
  await assert.rejects(invoke('/reports', 'POST', { targetType: 'review', targetId: REVIEW, reason: 'spam' }), { status: 409, message: /already reported/ });
  reply = () => Response.json({ code: '42501', message: 'new row violates row-level security policy' }, { status: 403 });
  await assert.rejects(invoke('/reports', 'POST', { targetType: 'cookbook', targetId: BOOK, reason: 'other' }), { status: 403, message: /not your own/ });
});

test('photo limits from the database become clear upload messages', async () => {
  for (const [code, message] of [['CB001', /too many unsaved photos/], ['CB002', /limit of 500 photos/]]) {
    const { api } = harness(() => Response.json({ code, message: 'limit' }, { status: 400 }));
    const user = await api.authenticate(headers);
    await assert.rejects(api.putPhoto(user, { id: PHOTO, data: Buffer.from('image') }), { status: 400, message });
  }
});

test('recipes whose author deleted their account decode with a null author', () => {
  assert.deepEqual(decodeSocial({ author_id: null, cookbook_id: BOOK }), { authorId: null, cookbookId: BOOK });
});
