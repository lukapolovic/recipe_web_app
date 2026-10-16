import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Existing projects upgrade with hosting/migrations/*.sql. Each migration must
// apply cleanly over the current schema and be safe to run again.
test('performance migration is idempotent and leaves the RLS lookup indexes in place', async () => {
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
    `);
    await db.exec(await readFile(new URL('../hosting/social-schema.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../hosting/migrations/001-performance.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const indexes = (await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map(row => row.indexname);
    for (const name of ['friendships_requester', 'friendships_addressee', 'review_replies_review', 'cookbook_recipes_image', 'cookbook_planners_cart']) assert.ok(indexes.includes(name), `${name} exists`);
    const acl = (await db.query("SELECT proacl::text AS acl FROM pg_proc WHERE proname='cookbook_can_read_as'")).rows[0].acl;
    assert.doesNotMatch(acl, /authenticated=/, 'Re-creating the helper keeps it private');
  } finally {
    await db.close();
  }
});
