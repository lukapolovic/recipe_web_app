import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { createApp } from '../server.js';

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const PHOTO = '44444444-4444-4444-8444-444444444444';
const AUTH = 'Bearer valid.test.token';
const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#eedbc5' } }).png().toBuffer();
const page = `<html><body><p>All the blog boilerplate.</p><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Garden tomato rice', recipeYield: '2 servings', totalTime: 'PT25M', recipeIngredient: ['200 g rice', '2 tomatoes'], recipeInstructions: ['Cook rice.', 'Stir in tomatoes.'], image: 'https://recipes.example/food.png', nutrition: { calories: '350 kcal' } })}</script></body></html>`;
const unauthorized = () => { throw Object.assign(new Error('Sign in to continue.'), { status: 401 }); };

function socialMock(overrides = {}) {
  const events = [];
  const api = {
    async authenticate(headers) {
      events.push('authenticate');
      if (headers.authorization !== AUTH) unauthorized();
      return USER;
    },
    async handle(request) {
      events.push('handle');
      if (request.pathname === '/api/social/config') return { status: 200, body: { configured: true, authRequired: true } };
      await api.authenticate(request.headers);
      return { status: 200, body: { ok: true } };
    },
    async putPhoto(user, photo) { events.push('putPhoto'); assert.equal(user, USER); return photo.id; },
    async getPhoto(headers, imageId) { events.push('getPhoto'); await api.authenticate(headers); assert.equal(imageId, PHOTO); return { data: Buffer.from('private-photo'), contentType: 'image/webp' }; },
    async removePhoto(user, imageId) { events.push('removePhoto'); assert.equal(user, USER); assert.equal(imageId, PHOTO); return true; },
    ...overrides,
  };
  return { api, events };
}
async function withServer(options, run) {
  const app = createApp(options);
  const base = 'http://127.0.0.1';
  // Exercise the production HTTP handler with real readable request bodies,
  // without opening sockets or contacting external services.
  const request = async (path, { method = 'GET', body, token = true, headers = {} } = {}) => {
    const requestHeaders = new Headers({ host: '127.0.0.1', ...(token ? { Authorization: AUTH } : {}), ...(body === undefined || Buffer.isBuffer(body) ? {} : { 'Content-Type': 'application/json' }), ...headers });
    const bytes = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const incoming = Object.assign(Readable.from(bytes ? [bytes] : []), { method, url: path, headers: Object.fromEntries(requestHeaders), socket: {} });
    const outgoingHeaders = new Headers();
    let status = 200; let output = null;
    const response = {
      headersSent: false,
      setHeader(key, value) { outgoingHeaders.set(key, String(value)); },
      writeHead(code, values) { status = code; for (const [key, value] of Object.entries(values || {})) outgoingHeaders.set(key, String(value)); this.headersSent = true; },
      end(value) { output = value === undefined ? null : value; },
    };
    await app.handler(incoming, response);
    return new Response(output, { status, headers: outgoingHeaders });
  };
  try { await run({ ...app, base, request }); }
  finally { app.server.close(() => {}); }
}

test('social HTTP mode blocks every demo and household API entry point', async () => {
  const { api, events } = socialMock();
  await withServer({ socialApi: api }, async ({ request }) => {
    for (const [path, method, body] of [['/api/recipes', 'GET'], ['/api/recipes', 'POST', {}], ['/api/session', 'GET'], ['/api/planner', 'GET'], ['/api/photos', 'POST', png], ['/api/import', 'POST', { url: 'https://recipes.example/rice' }], ['/api/nutrition', 'POST', {}], ['/api/examples', 'POST', {}]]) {
      const response = await request(path, { method, body });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal((await response.json()).error, 'Endpoint not found.');
    }
    assert.deepEqual(events, []);
    const config = await request('/api/social/config', { token: false });
    assert.equal(config.status, 200);
    assert.deepEqual(await config.json(), { configured: true, authRequired: true });
    assert.deepEqual(events, ['handle']);
  });
});

test('social JSON routing forwards status, bearer token, body and literal search parameters', async () => {
  let forwarded;
  const { api } = socialMock({ handle: async input => { forwarded = input; return { status: 201, body: { id: 'new-cookbook' } }; } });
  await withServer({ socialApi: api }, async ({ request }) => {
    const response = await request('/api/social/cookbooks?q=100%25+tomato&category=Lunch', { method: 'POST', body: { name: 'Our Sunday recipes', visibility: 'private' } });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: 'new-cookbook' });
    assert.equal(forwarded.method, 'POST');
    assert.equal(forwarded.pathname, '/api/social/cookbooks');
    assert.equal(forwarded.query.get('q'), '100% tomato');
    assert.equal(forwarded.query.get('category'), 'Lunch');
    assert.equal(forwarded.headers.authorization, AUTH);
    assert.deepEqual(forwarded.body, { name: 'Our Sunday recipes', visibility: 'private' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });
});

test('social JSON parser and same-origin guard reject invalid requests before adapter actions', async () => {
  const { api, events } = socialMock();
  await withServer({ socialApi: api }, async ({ request }) => {
    assert.equal((await request('/api/social/cookbooks', { method: 'POST', body: '{broken' })).status, 400);
    assert.equal((await request('/api/social/cookbooks', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await request('/api/social/cookbooks', { method: 'POST', body: { description: 'x'.repeat(270000) } })).status, 413);
    assert.equal((await request('/api/social/feed', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await request('/api/social/feed', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.deepEqual(events, []);
  });
});

test('unauthenticated recipe imports stop before HTML/image fetches and upload work', async () => {
  const { api, events } = socialMock();
  let htmlCalls = 0, imageCalls = 0;
  await withServer({ socialApi: api, fetchHtml: async () => { htmlCalls++; throw new Error('must not fetch'); }, fetchImage: async () => { imageCalls++; throw new Error('must not fetch'); } }, async ({ request }) => {
    const response = await request('/api/social/import', { method: 'POST', token: false, body: { url: 'https://recipes.example/rice' } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Sign in to continue.' });
    assert.equal(htmlCalls, 0);
    assert.equal(imageCalls, 0);
    assert.deepEqual(events, ['authenticate']);
    const malformed = await request('/api/social/import', { method: 'POST', token: false, body: 'not-json' });
    assert.equal(malformed.status, 401, 'auth happens even before import body parsing');
  });
});

test('authenticated link import strips boilerplate, keeps source calories and stores a normalized owned photo', async () => {
  let saved;
  const { api, events } = socialMock({ putPhoto: async (user, photo) => { events.push('putPhoto'); assert.equal(user, USER); saved = photo; return photo.id; } });
  await withServer({ socialApi: api, fetchHtml: async url => { events.push('fetchHtml'); return { html: page, url }; }, fetchImage: async url => { events.push('fetchImage'); assert.equal(url, 'https://recipes.example/food.png'); return { data: png }; } }, async ({ request }) => {
    const response = await request('/api/social/import', { method: 'POST', body: { url: 'https://recipes.example/rice' } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.recipe.title, 'Garden tomato rice');
    assert.deepEqual(result.recipe.instructions, ['Cook rice.', 'Stir in tomatoes.']);
    assert.equal(result.recipe.ingredients.length, 2);
    assert.equal(result.recipe.sourceCaloriesPerServing, 350);
    assert.equal(result.recipe.imageId, saved.id);
    assert.equal(result.imageUrl, undefined);
    assert.equal(saved.width, 4);
    assert.equal(saved.height, 3);
    assert.equal(saved.contentType, 'image/webp');
    assert.equal(saved.data.subarray(8, 12).toString(), 'WEBP');
    assert.deepEqual(events, ['authenticate', 'fetchHtml', 'fetchImage', 'putPhoto']);
  });
});

test('image import failures preserve the usable recipe and explain manual photo fallback', async () => {
  const { api, events } = socialMock();
  await withServer({ socialApi: api, fetchHtml: async url => ({ html: page, url }), fetchImage: async () => { throw new Error('remote image denied'); } }, async ({ request }) => {
    const response = await request('/api/social/import', { method: 'POST', body: { url: 'https://recipes.example/rice' } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.recipe.title, 'Garden tomato rice');
    assert.ok(result.warnings.some(message => /photo could not be imported/.test(message)));
    assert.equal(result.imageUrl, undefined);
    assert.equal(events.includes('putPhoto'), false);
  });
});

test('all photo operations require authentication before normalization, storage reads or deletion', async () => {
  const { api, events } = socialMock();
  await withServer({ socialApi: api }, async ({ request }) => {
    for (const [path, method, body] of [['/api/social/photos', 'POST', Buffer.from('invalid-image')], [`/api/social/photos/${PHOTO}`, 'GET'], [`/api/social/photos/${PHOTO}`, 'HEAD'], [`/api/social/photos/${PHOTO}`, 'DELETE']]) {
      const response = await request(path, { method, body, token: false, headers: method === 'POST' ? { 'Content-Type': 'text/plain' } : {} });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
    assert.equal(events.includes('putPhoto'), false);
    assert.equal(events.includes('removePhoto'), false);
    assert.equal(events.filter(event => event === 'authenticate').length, 4);
  });
});

test('photo upload returns normalized image identity and dimensions; downloads stay private and HEAD omits bytes', async () => {
  let uploaded;
  const { api } = socialMock({ putPhoto: async (user, photo) => { assert.equal(user, USER); uploaded = photo; return photo.id; } });
  await withServer({ socialApi: api }, async ({ request }) => {
    const upload = await request('/api/social/photos', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } });
    assert.equal(upload.status, 201);
    assert.deepEqual(await upload.json(), { imageId: uploaded.id, width: 4, height: 3 });
    assert.equal(uploaded.data.subarray(8, 12).toString(), 'WEBP');
    const get = await request(`/api/social/photos/${PHOTO}`);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'image/webp');
    assert.equal(get.headers.get('cache-control'), 'private, no-store');
    assert.equal(await get.text(), 'private-photo');
    const head = await request(`/api/social/photos/${PHOTO}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(Buffer.byteLength('private-photo')));
    assert.equal(await head.text(), '');
    assert.equal((await request('/api/social/photos', { method: 'POST', body: png, headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await request('/api/social/photos', { method: 'POST', body: Buffer.from('invalid-image'), headers: { 'Content-Type': 'image/png' } })).status, 400);
  });
});

test('unavailable photos and rejected deletions do not claim successful access or removal', async () => {
  const { api } = socialMock({ getPhoto: async headers => { await api.authenticate(headers); return null; }, removePhoto: async user => { assert.equal(user, USER); return false; } });
  await withServer({ socialApi: api }, async ({ request }) => {
    const get = await request(`/api/social/photos/${PHOTO}`);
    assert.equal(get.status, 404);
    const deletion = await request(`/api/social/photos/${PHOTO}`, { method: 'DELETE' });
    assert.equal(deletion.status, 404, 'attached or foreign photos must not report deleted:true');
    assert.ok((await deletion.json()).error);
  });
});

test('adapter auth and conflict errors keep their HTTP status in the server envelope', async () => {
  const { api } = socialMock({ handle: async ({ pathname }) => { throw Object.assign(new Error(pathname.endsWith('/review') ? 'You cannot review your own cookbook.' : 'The shopping list changed on another device.'), { status: pathname.endsWith('/review') ? 403 : 409 }); } });
  await withServer({ socialApi: api }, async ({ request }) => {
    const review = await request('/api/social/recipes/example/review', { method: 'PUT', body: { rating: 5, comment: 'Hello' } });
    assert.equal(review.status, 403);
    assert.deepEqual(await review.json(), { error: 'You cannot review your own cookbook.' });
    const planner = await request('/api/social/cookbooks/example/planner', { method: 'PUT', body: { cart: [], checked: {}, version: 1 } });
    assert.equal(planner.status, 409);
  });
});

test('static files revalidate with ETags and malformed paths are rejected without a server error', async () => {
  const { api } = socialMock();
  await withServer({ socialApi: api }, async ({ request }) => {
    const first = await request('/app.js', { token: false });
    assert.equal(first.status, 200);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    const again = await request('/app.js', { token: false, headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    assert.equal(await again.text(), '');
    assert.equal((await request('/%E0%A4%A', { token: false })).status, 400);
    assert.equal((await request('/demo-assets', { token: false })).status, 404);
  });
});

test('design previews are static and isolated while the normal app stays unframeable', async () => {
  const { api, events } = socialMock();
  await withServer({ socialApi: api }, async ({ request }) => {
    const normal = await request('/', { token: false });
    assert.equal(normal.status, 200);
    assert.match(normal.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    const preview = await request('/design-preview.html?palette=sage&designPreview=recipe', { token: false });
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
    assert.match(preview.headers.get('Content-Security-Policy'), /connect-src 'none'/);
    assert.match(preview.headers.get('Content-Security-Policy'), /form-action 'none'/);
    assert.match(await preview.text(), /class="design-preview"/);
    const comparison = await request('/designs.html', { token: false });
    assert.equal(comparison.status, 200);
    assert.match(comparison.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.deepEqual(events, [], 'static design views must not touch the account API');
  });
});

test('local demo mode keeps draft photos in memory and offers no household API', async () => {
  await withServer({}, async ({ request }) => {
    const config = await request('/api/social/config', { token: false });
    assert.equal((await config.json()).configured, false);
    const upload = await request('/api/photos', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' }, token: false });
    assert.equal(upload.status, 201);
    const { imageId } = await upload.json();
    const get = await request(`/api/photos/${imageId}`, { token: false });
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'image/webp');
    assert.equal((await request(`/api/photos/${imageId}`, { method: 'DELETE', token: false })).status, 200);
    assert.equal((await request(`/api/photos/${imageId}`, { token: false })).status, 404);
    for (const [path, method, body] of [['/api/recipes', 'GET'], ['/api/recipes', 'POST', {}], ['/api/session', 'GET'], ['/api/planner', 'GET'], ['/api/nutrition', 'POST', {}], ['/api/examples', 'POST', {}], ['/api/social/feed', 'GET']]) {
      const response = await request(path, { method, body, token: false });
      assert.ok([404, 503].includes(response.status), `${method} ${path} -> ${response.status}`);
    }
  });
});

test('a signed-in photo copy is made through the adapter for the caller, and unreadable photos are not found', async () => {
  const stored = [];
  const { api, events } = socialMock({
    putPhoto: async (user, photo) => { events.push('putPhoto'); assert.equal(user, USER); stored.push(photo); return photo.id; },
  });
  await withServer({ socialApi: api }, async ({ request }) => {
    const copy = await request(`/api/social/photos/${PHOTO}/copy`, { method: 'POST', body: {} });
    assert.equal(copy.status, 201);
    const { imageId } = await copy.json();
    assert.notEqual(imageId, PHOTO);
    assert.equal(stored[0].id, imageId);
    assert.equal(stored[0].data.toString(), 'private-photo');
    assert.equal((await request(`/api/social/photos/${PHOTO}/copy`, { method: 'POST', body: {}, token: false })).status, 401);
    assert.equal((await request(`/api/social/photos/${PHOTO}/copy`, { method: 'GET' })).status, 405);
  });
  const hidden = socialMock({ getPhoto: async () => null });
  await withServer({ socialApi: hidden.api }, async ({ request }) => {
    assert.equal((await request(`/api/social/photos/${PHOTO}/copy`, { method: 'POST', body: {} })).status, 404);
  });
});

test('keepalive cron requires the exact CRON_SECRET bearer before pinging the database', async () => {
  let pings = 0;
  const { api, events } = socialMock({ keepalive: async () => { pings++; return { at: '2026-10-16T06:17:00Z' }; } });
  await withServer({ socialApi: api, cronSecret: 'cron-secret-value' }, async ({ request }) => {
    for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: 'Bearer cron-secret-value-and-more' }, { Authorization: 'cron-secret-value' }]) {
      assert.equal((await request('/api/cron/keepalive', { token: false, headers })).status, 401);
    }
    // A user session token is not the cron secret.
    assert.equal((await request('/api/cron/keepalive')).status, 401);
    assert.equal(pings, 0);
    const response = await request('/api/cron/keepalive', { token: false, headers: { Authorization: 'Bearer cron-secret-value' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true, at: '2026-10-16T06:17:00Z' });
    assert.equal(pings, 1);
    assert.equal((await request('/api/cron/keepalive', { method: 'POST', body: {}, token: false, headers: { Authorization: 'Bearer cron-secret-value' } })).status, 405);
    // The same-origin guard still applies to the cron route.
    assert.equal((await request('/api/cron/keepalive', { token: false, headers: { Authorization: 'Bearer cron-secret-value', Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await request('/api/cron/keepalive', { token: false, headers: { Authorization: 'Bearer cron-secret-value', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal(pings, 1);
    assert.deepEqual(events, []);
  });
});

test('keepalive cron stays closed when CRON_SECRET is not configured', async () => {
  let pings = 0;
  const { api } = socialMock({ keepalive: async () => { pings++; return {}; } });
  for (const cronSecret of [undefined, '']) {
    await withServer({ socialApi: api, cronSecret }, async ({ request }) => {
      for (const headers of [{}, { Authorization: 'Bearer ' }, { Authorization: 'Bearer undefined' }]) {
        assert.equal((await request('/api/cron/keepalive', { token: false, headers })).status, 503);
      }
    });
  }
  assert.equal(pings, 0);
});
