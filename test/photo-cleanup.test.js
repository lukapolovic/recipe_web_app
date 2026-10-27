import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Keep in sync with the cleanup action in hosting/backup-ssh.sh, which the backup workflow runs.
const CLEANUP = `
  delete from public.social_photos p
  where p.created_at < now() - interval '7 days'
    and not exists (select 1 from public.cookbook_recipes r where r.image_id = p.id)
    and not exists (select 1 from public.cookbooks c where c.cover_image_id = p.id)
  returning p.path`;

test('weekly cleanup deletes only unattached photo rows older than 7 days', async () => {
  const script = await readFile(new URL('../hosting/backup-ssh.sh', import.meta.url), 'utf8');
  const squash = text => text.replace(/\s+/g, ' ').trim();
  assert.ok(squash(script).includes(squash(CLEANUP)), 'The backup script runs the statement tested here');
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
    const owner = randomUUID();
    await db.query('INSERT INTO auth.users(id,raw_user_meta_data,email) VALUES($1,$2,$3)', [owner, { username: 'alice', display_name: 'Alice' }, 'alice@example.test']);
    const photo = async age => {
      const id = randomUUID();
      await db.query(`INSERT INTO public.social_photos(id,owner_id,path,created_at) VALUES($1,$2,$3,now() - $4::interval)`, [id, owner, `${owner}/${id}.webp`, age]);
      return id;
    };
    const [oldDraft, newDraft, recipePhoto, coverPhoto] = [await photo('8 days'), await photo('6 days'), await photo('30 days'), await photo('30 days')];
    const { rows: [book] } = await db.query('INSERT INTO public.cookbooks(owner_id,name,cover_image_id) VALUES($1,$2,$3) RETURNING id', [owner, 'Ours', coverPhoto]);
    await db.query(`INSERT INTO public.cookbook_recipes(cookbook_id,author_id,title,category,diet,meat_type,servings,minutes,ingredients,instructions,image_id)
      VALUES($1,$2,'Rice','Dinner','Vegan','Vegetarian',2,20,'[{"name":"Rice","quantity":1,"unit":"cup"}]','["Cook."]',$3)`, [book.id, owner, recipePhoto]);
    const deleted = (await db.query(CLEANUP)).rows.map(row => row.path);
    assert.deepEqual(deleted, [`${owner}/${oldDraft}.webp`]);
    const left = (await db.query('SELECT id FROM public.social_photos')).rows.map(row => row.id).sort();
    assert.deepEqual(left, [newDraft, recipePhoto, coverPhoto].sort());
    assert.deepEqual((await db.query(CLEANUP)).rows, []);
  } finally {
    await db.close();
  }
});
