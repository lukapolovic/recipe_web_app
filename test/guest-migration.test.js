import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// hosting/migrations/001-guest-browsing.sql upgrades a live database; social-schema.sql already holds the same change.
// Running it twice on top of the schema must succeed and leave guests reading public cookbooks only.
test('the guest-browsing migration is idempotent and opens public cookbooks only', async () => {
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
      GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated;
    `);
    await db.exec(await readFile(new URL('../hosting/social-schema.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../hosting/migrations/001-guest-browsing.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const owner = randomUUID();
    await db.query('INSERT INTO auth.users(id,raw_user_meta_data,email) VALUES($1,$2,$3)', [owner, { username: 'alice', display_name: 'Alice' }, 'alice@example.test']);
    const book = async visibility => (await db.query('INSERT INTO public.cookbooks(owner_id,name,visibility) VALUES($1,$2,$3) RETURNING id', [owner, visibility, visibility])).rows[0].id;
    const shared = await book('public');
    await book('friends'); await book('private');
    await db.exec("SELECT set_config('request.jwt.claim.sub', '', false); SET ROLE anon");
    assert.deepEqual((await db.query('SELECT id FROM public.cookbooks')).rows.map(row => row.id), [shared]);
    assert.deepEqual((await db.query('SELECT username FROM public.profiles')).rows.map(row => row.username), ['alice']);
    await assert.rejects(db.query('SELECT * FROM public.friendships'), error => error.code === '42501');
    await db.exec('RESET ROLE');
    const policies = (await db.query("SELECT policyname FROM pg_policies WHERE policyname IN ('books_read','profiles_read_guest','cookbook_photo_select_guest')")).rows.map(row => row.policyname).sort();
    assert.deepEqual(policies, ['books_read', 'cookbook_photo_select_guest', 'profiles_read_guest']);
  } finally {
    await db.close();
  }
});
