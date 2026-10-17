import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server.js';
import { createSocialApi } from '../social-api.js';

const SECRET = 'cron-secret-value';
// Drive the production handler in memory, as test/social-server.test.js does.
async function call(app, path, { method = 'GET', headers = {} } = {}) {
  const incoming = Object.assign(Readable.from([]), { method, url: path, headers: { host: '127.0.0.1', ...headers }, socket: {} });
  const outgoing = new Headers(); let status = 200; let output = null;
  await app.handler(incoming, {
    headersSent: false,
    setHeader(key, value) { outgoing.set(key, String(value)); },
    writeHead(code, values) { status = code; for (const [key, value] of Object.entries(values || {})) outgoing.set(key, String(value)); this.headersSent = true; },
    end(value) { output = value === undefined ? null : value; },
  });
  return new Response(output, { status, headers: outgoing });
}
function socialStub() {
  const stub = { pings: 0, events: [] };
  stub.api = {
    async keepalive() { stub.pings++; return { at: '2026-10-16T06:17:00Z' }; },
    async authenticate() { stub.events.push('authenticate'); return { id: 'user' }; },
    async handle() { stub.events.push('handle'); return { status: 200, body: {} }; },
  };
  return stub;
}

test('keepalive cron requires the exact CRON_SECRET bearer before pinging the database', async () => {
  const stub = socialStub();
  const app = createApp({ socialApi: stub.api, cronSecret: SECRET });
  try {
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${SECRET}-and-more` }, { authorization: SECRET }, { authorization: 'Bearer valid.user.token' }]) {
      assert.equal((await call(app, '/api/cron/keepalive', { headers })).status, 401);
    }
    assert.equal(stub.pings, 0);
    const response = await call(app, '/api/cron/keepalive', { headers: { authorization: `Bearer ${SECRET}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true, at: '2026-10-16T06:17:00Z' });
    assert.equal(stub.pings, 1);
    assert.equal((await call(app, '/api/cron/keepalive', { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } })).status, 405);
    // The same-origin guard still applies to the cron route.
    assert.equal((await call(app, '/api/cron/keepalive', { headers: { authorization: `Bearer ${SECRET}`, origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await call(app, '/api/cron/keepalive', { headers: { authorization: `Bearer ${SECRET}`, 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal(stub.pings, 1);
    assert.deepEqual(stub.events, [], 'No user authentication or social routing happens for the cron');
    // Ordinary API routes keep working next to it.
    assert.equal((await call(app, '/api/social/feed', { headers: { origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await call(app, '/api/social/feed')).status, 200);
  } finally {
    app.server.close(() => {});
  }
});

test('keepalive cron stays closed when CRON_SECRET is not configured', async () => {
  const stub = socialStub();
  for (const cronSecret of [undefined, '']) {
    const app = createApp({ socialApi: stub.api, cronSecret });
    try {
      for (const headers of [{}, { authorization: 'Bearer ' }, { authorization: 'Bearer undefined' }]) {
        assert.equal((await call(app, '/api/cron/keepalive', { headers })).status, 503);
      }
    } finally {
      app.server.close(() => {});
    }
  }
  assert.equal(stub.pings, 0);
});

test('keepalive makes one anonymous RPC through the publishable key', async () => {
  const calls = [];
  let reply = Response.json('2026-10-16T06:17:00.123+00:00');
  const api = createSocialApi({ url: 'https://example.supabase.co', key: 'sb_publishable_test', fetcher: async (url, options) => { calls.push({ path: url.pathname, ...options }); return reply; } });
  assert.deepEqual(await api.keepalive(), { at: '2026-10-16T06:17:00.123+00:00' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/rest/v1/rpc/keepalive');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.apikey, 'sb_publishable_test');
  assert.equal(calls[0].headers.Authorization, undefined);
  reply = new Response('{}', { status: 500 });
  await assert.rejects(api.keepalive(), { status: 503 });
});

test('keepalive() is callable by anon and reads no application data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL UNIQUE);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../hosting/social-schema.sql', import.meta.url), 'utf8'));
    await db.exec('SET ROLE anon');
    const { rows } = await db.query('SELECT public.keepalive() AS at');
    assert.ok(rows[0].at instanceof Date);
    // Running as the caller, anon still cannot read any table.
    await assert.rejects(db.query('SELECT * FROM public.profiles'), error => error.code === '42501');
    await db.exec('RESET ROLE');
    const { rows: [fn] } = await db.query("SELECT prosecdef, proacl::text AS acl FROM pg_proc WHERE proname='keepalive'");
    assert.equal(fn.prosecdef, false);
    assert.match(fn.acl, /anon=X/);
    assert.doesNotMatch(fn.acl, /(^|[{,])=X/, 'Not granted to PUBLIC');
  } finally {
    await db.close();
  }
});
