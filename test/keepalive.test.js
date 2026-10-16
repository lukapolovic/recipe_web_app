import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

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
