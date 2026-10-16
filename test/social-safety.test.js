import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Account deletion, reports and photo limits, run against the unmodified
// deployment schema in PostgreSQL (WASM), set up like social-rls.test.js.
const BUCKET = 'social-recipe-photos';

async function setup(names) {
  const db = new PGlite();
  const people = Object.fromEntries(names.map(name => [name, randomUUID()]));
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL UNIQUE);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
  `);
  await db.exec(await readFile(new URL('../hosting/social-schema.sql', import.meta.url), 'utf8'));
  for (const [name, personId] of Object.entries(people)) {
    await db.query('INSERT INTO auth.users(id,raw_user_meta_data,email) VALUES($1,$2,$3)', [personId, { username: name, display_name: name }, `${name}@example.test`]);
  }
  async function as(name, callback) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [name ? people[name] : '']);
    await db.exec(name ? 'SET ROLE authenticated' : 'SET ROLE anon');
    try { return await callback(); }
    finally { await db.exec('RESET ROLE'); }
  }
  const query = (name, sql, params = []) => as(name, () => db.query(sql, params));
  const admin = (sql, params = []) => db.query(sql, params);
  const kit = {
    db, people, query, admin,
    async book(owner, name, visibility = 'public', cover = null) {
      const id = randomUUID();
      await query(owner, 'INSERT INTO public.cookbooks(id,owner_id,name,visibility,cover_image_id) VALUES($1,$2,$3,$4,$5)', [id, people[owner], name, visibility, cover]);
      return id;
    },
    async recipe(author, book, image = null) {
      const id = randomUUID();
      await query(author, 'INSERT INTO public.cookbook_recipes(id,cookbook_id,author_id,title,servings,minutes,ingredients,instructions,image_id) VALUES($1,$2,$3,$4,2,20,$5,$6,$7)', [id, book, people[author], `${author}'s supper`, [{ name: 'Rice', quantity: 200, unit: 'g' }], ['Cook the rice.'], image]);
      return id;
    },
    async photo(owner) {
      const id = randomUUID(), path = `${people[owner]}/${id}.webp`;
      await query(owner, 'INSERT INTO public.social_photos(id,owner_id,path) VALUES($1,$2,$3)', [id, people[owner], path]);
      await query(owner, 'INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', [BUCKET, path]);
      return { id, path };
    },
    async partner(owner, book, partner) {
      const invitation = (await query(owner, 'SELECT * FROM public.cookbook_invite_partner($1,$2)', [book, partner])).rows[0].id;
      await query(partner, 'SELECT * FROM public.cookbook_accept_invitation($1)', [invitation]);
    },
    async review(name, recipe) {
      return (await query(name, 'INSERT INTO public.recipe_reviews(recipe_id,user_id,rating,comment) VALUES($1,$2,4,$3) RETURNING id', [recipe, people[name], 'Lovely.'])).rows[0].id;
    },
    async reply(name, review) {
      return (await query(name, 'INSERT INTO public.review_replies(review_id,user_id,comment) VALUES($1,$2,$3) RETURNING id', [review, people[name], 'Thank you.'])).rows[0].id;
    },
    async friends(from, to) {
      const id = (await query(from, 'INSERT INTO public.friendships(requester_id,addressee_id) VALUES($1,$2) RETURNING id', [people[from], people[to]])).rows[0].id;
      await query(to, 'SELECT * FROM public.cookbook_accept_friendship($1)', [id]);
    },
    deleteAccount: name => query(name, 'SELECT public.delete_my_account() AS paths').then(result => result.rows[0].paths),
    count: async (sql, params = []) => Number((await admin(`SELECT count(*) AS n FROM ${sql}`, params)).rows[0].n),
  };
  return kit;
}
const denied = (operation, code = '42501') => assert.rejects(operation, error => error.code === code, `Expected PostgreSQL ${code}`);

test('deleting an owner with a partner hands the cookbook, its recipes and their photos to the partner', async () => {
  const k = await setup(['olga', 'pete', 'sam', 'fay', 'stan']);
  const { people, query, admin, count } = k;
  try {
    const cover = await k.photo('olga'), olgaPhoto = await k.photo('olga'), petePhoto = await k.photo('pete');
    const shared = await k.book('olga', 'Our table', 'public', cover.id);
    await k.partner('olga', shared, 'pete');
    const olgaRecipe = await k.recipe('olga', shared, olgaPhoto.id), peteRecipe = await k.recipe('pete', shared, petePhoto.id);
    const soloPhoto = await k.photo('olga'), draft = await k.photo('olga');
    const solo = await k.book('olga', 'Just me', 'private');
    await k.recipe('olga', solo, soloPhoto.id);
    const pending = await k.book('olga', 'Waiting for Sam', 'private');
    await query('olga', 'SELECT * FROM public.cookbook_invite_partner($1,$2)', [pending, 'sam']);
    const samBook = await k.book('sam', 'Sam bakes'), samRecipe = await k.recipe('sam', samBook);
    const fayReview = await k.review('fay', olgaRecipe);
    await k.review('fay', peteRecipe);
    await k.reply('olga', fayReview);
    await k.review('olga', samRecipe);
    await query('olga', 'INSERT INTO public.cookbook_follows(user_id,cookbook_id) VALUES($1,$2)', [people.olga, samBook]);
    await query('fay', 'INSERT INTO public.cookbook_follows(user_id,cookbook_id) VALUES($1,$2)', [people.fay, shared]);
    await k.friends('olga', 'fay');
    await query('olga', 'INSERT INTO public.reports(target_type,target_id,reason) VALUES($1,$2,$3)', ['profile', people.stan, 'spam']);

    await denied(() => query(null, 'SELECT public.delete_my_account()'));
    const paths = await k.deleteAccount('olga');
    assert.deepEqual(paths, [soloPhoto.path, draft.path].sort(), 'Only photos nobody keeps are returned for file removal');

    const book = (await admin('SELECT owner_id,cover_image_id FROM public.cookbooks WHERE id=$1', [shared])).rows[0];
    assert.equal(book.owner_id, people.pete);
    assert.equal(book.cover_image_id, cover.id);
    assert.deepEqual((await admin('SELECT user_id,role,status FROM public.cookbook_members WHERE cookbook_id=$1', [shared])).rows, [{ user_id: people.pete, role: 'owner', status: 'accepted' }]);
    const recipes = Object.fromEntries((await admin('SELECT id,author_id,image_id FROM public.cookbook_recipes WHERE cookbook_id=$1', [shared])).rows.map(row => [row.id, row]));
    assert.equal(recipes[olgaRecipe].author_id, null, 'The leaver’s recipe stays, credited to a former member');
    assert.equal(recipes[olgaRecipe].image_id, olgaPhoto.id);
    assert.equal(recipes[peteRecipe].author_id, people.pete);
    const photos = (await admin('SELECT id,owner_id,path FROM public.social_photos ORDER BY path')).rows;
    assert.deepEqual(photos.filter(row => [cover.id, olgaPhoto.id].includes(row.id)).map(row => row.owner_id), [people.pete, people.pete]);
    assert.equal(photos.find(row => row.id === olgaPhoto.id).path, olgaPhoto.path, 'The stored file keeps its path');
    assert.equal(photos.length, 3);

    for (const id of [solo, pending]) assert.equal(await count('public.cookbooks WHERE id=$1', [id]), 0);
    assert.equal(await count('public.cookbook_members WHERE user_id=$1', [people.sam]), 1, 'Sam keeps only their own cookbook membership');
    assert.equal(await count('auth.users WHERE id=$1', [people.olga]), 0);
    assert.equal(await count('public.profiles WHERE id=$1', [people.olga]), 0);
    for (const table of ['recipe_reviews', 'review_replies', 'cookbook_follows']) assert.equal(await count(`public.${table} WHERE user_id=$1`, [people.olga]), 0, table);
    assert.equal(await count('public.friendships WHERE $1 IN (requester_id,addressee_id)', [people.olga]), 0);
    assert.equal(await count('public.reports WHERE reporter_id=$1', [people.olga]), 0);
    assert.equal(await count('public.recipe_reviews WHERE user_id=$1', [people.fay]), 2, 'Visitors’ reviews of surviving recipes remain');
    assert.equal(await count('public.cookbook_follows WHERE user_id=$1', [people.fay]), 1);
    assert.equal(await count('public.cookbook_recipes WHERE id=$1', [samRecipe]), 1);

    // The server removes the returned files with the leaver's still-valid token.
    const removed = await query('olga', 'DELETE FROM storage.objects WHERE name=ANY($1) RETURNING name', [paths]);
    assert.deepEqual(removed.rows.map(row => row.name).sort(), paths);
    // The kept file is still served to readers of the cookbook and to its new owner.
    assert.equal((await query('stan', 'SELECT name FROM storage.objects WHERE name=$1', [olgaPhoto.path])).rows.length, 1);
    assert.equal((await query('pete', 'SELECT name FROM storage.objects WHERE name=$1', [olgaPhoto.path])).rows.length, 1);
    assert.equal((await query('stan', 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [olgaPhoto.path])).rows.length, 0);
    assert.equal((await query('pete', 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [olgaPhoto.path])).rows.length, 0, 'An attached photo’s file stays');

    // The new owner edits the recipe, then discards the inherited photo: metadata first, then the file.
    await query('pete', 'UPDATE public.cookbook_recipes SET title=$1,image_id=NULL WHERE id=$2', ['Olga’s supper, kept', olgaRecipe]);
    assert.equal((await query('stan', 'DELETE FROM public.social_photos WHERE id=$1 RETURNING id', [olgaPhoto.id])).rows.length, 0);
    assert.equal((await query('pete', 'DELETE FROM public.social_photos WHERE id=$1 RETURNING id', [olgaPhoto.id])).rows.length, 1);
    assert.equal((await query('pete', 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [olgaPhoto.path])).rows.length, 1);
    // A photo still recorded under a current account is never treated as an orphan.
    assert.equal((await query('stan', 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [petePhoto.path])).rows.length, 0);
  } finally { await k.db.close(); }
});

test('deleting a partner or a solo cook leaves every other account intact', async () => {
  const k = await setup(['ana', 'ben', 'cyd', 'dee']);
  const { people, query, admin, count } = k;
  try {
    const shared = await k.book('ana', 'Ana & Ben', 'friends');
    await k.partner('ana', shared, 'ben');
    const benPhoto = await k.photo('ben');
    const benRecipe = await k.recipe('ben', shared, benPhoto.id), anaRecipe = await k.recipe('ana', shared);
    const cyBook = await k.book('cyd', 'Cyd cooks'), cyRecipe = await k.recipe('cyd', cyBook);
    const cyPhoto = await k.photo('cyd');
    await query('cyd', 'UPDATE public.cookbook_recipes SET image_id=$1 WHERE id=$2', [cyPhoto.id, cyRecipe]);
    const deeReview = await k.review('dee', cyRecipe);
    await k.reply('cyd', deeReview);
    await k.review('ben', cyRecipe);
    await k.friends('dee', 'ben');
    await k.friends('dee', 'cyd');

    assert.deepEqual(await k.deleteAccount('ben'), []);
    assert.equal((await admin('SELECT owner_id FROM public.cookbooks WHERE id=$1', [shared])).rows[0].owner_id, people.ana);
    assert.deepEqual((await admin('SELECT user_id,role FROM public.cookbook_members WHERE cookbook_id=$1', [shared])).rows, [{ user_id: people.ana, role: 'owner' }]);
    assert.equal((await admin('SELECT author_id FROM public.cookbook_recipes WHERE id=$1', [benRecipe])).rows[0].author_id, null);
    assert.equal((await admin('SELECT owner_id FROM public.social_photos WHERE id=$1', [benPhoto.id])).rows[0].owner_id, people.ana);
    assert.equal((await admin('SELECT author_id FROM public.cookbook_recipes WHERE id=$1', [anaRecipe])).rows[0].author_id, people.ana);
    assert.equal(await count('public.recipe_reviews WHERE recipe_id=$1', [cyRecipe]), 1, 'Only Ben’s review of Cy’s recipe goes');
    // Ana can still read and edit the recipe Ben wrote.
    assert.equal((await query('ana', 'UPDATE public.cookbook_recipes SET title=$1 WHERE id=$2 RETURNING id', ['Ben’s classic', benRecipe])).rows.length, 1);

    assert.deepEqual(await k.deleteAccount('cyd'), [cyPhoto.path], 'A solo cook’s photos all go');
    assert.equal(await count('public.cookbooks WHERE id=$1', [cyBook]), 0);
    assert.equal(await count('public.recipe_reviews WHERE user_id=$1', [people.dee]), 0, 'Reviews of a deleted cookbook go with it');
    assert.equal(await count('public.friendships WHERE $1 IN (requester_id,addressee_id)', [people.dee]), 0);
    for (const name of ['ana', 'dee']) assert.equal(await count('public.profiles WHERE id=$1', [people[name]]), 1);
    assert.equal(await count('public.cookbook_recipes WHERE cookbook_id=$1', [shared]), 2);
    assert.equal(await count('public.social_photos'), 1);
  } finally { await k.db.close(); }
});

test('reports: only for content the reporter can read and does not own, once each, private to the reporter', async () => {
  const k = await setup(['rae', 'sid', 'tom']);
  const { people, query } = k;
  try {
    const open = await k.book('sid', 'Sid in public'), hidden = await k.book('sid', 'Sid in private', 'private');
    const openRecipe = await k.recipe('sid', open), hiddenRecipe = await k.recipe('sid', hidden);
    const tomReview = await k.review('tom', openRecipe), sidReply = await k.reply('sid', tomReview);
    const report = (type, id, name = 'rae', reason = 'spam', note = '') => query(name, 'INSERT INTO public.reports(target_type,target_id,reason,note) VALUES($1,$2,$3,$4) RETURNING id,reporter_id', [type, id, reason, note]);

    for (const [type, id] of [['profile', people.sid], ['cookbook', open], ['recipe', openRecipe], ['review', tomReview], ['reply', sidReply]]) {
      assert.equal((await report(type, id)).rows[0].reporter_id, people.rae, type);
    }
    await denied(() => report('recipe', openRecipe), '23505');
    for (const [type, id] of [['cookbook', hidden], ['recipe', hiddenRecipe], ['profile', randomUUID()], ['review', randomUUID()], ['profile', people.rae]]) await denied(() => report(type, id), '42501');
    await denied(() => report('recipe', openRecipe, 'sid'), '42501');
    await denied(() => report('review', tomReview, 'tom'), '42501');
    await denied(() => report('reply', sidReply, 'sid'), '42501');
    await denied(() => report('dish', openRecipe), '42501');
    await denied(() => report('recipe', openRecipe, 'tom', 'boring'), '23514');
    await denied(() => report('cookbook', open, 'tom', 'other', 'x'.repeat(501)), '23514');
    await denied(() => query('tom', 'INSERT INTO public.reports(reporter_id,target_type,target_id,reason) VALUES($1,$2,$3,$4)', [people.rae, 'cookbook', open, 'spam']));
    await denied(() => query(null, 'INSERT INTO public.reports(target_type,target_id,reason) VALUES($1,$2,$3)', ['cookbook', open, 'spam']));
    assert.equal((await report('cookbook', open, 'tom', 'copyright', 'Copied from my blog.')).rows.length, 1);

    assert.equal((await query('rae', 'SELECT id FROM public.reports')).rows.length, 5);
    assert.equal((await query('tom', 'SELECT id FROM public.reports')).rows.length, 1);
    assert.equal((await query('sid', 'SELECT id FROM public.reports')).rows.length, 0, 'The reported person cannot see reports');
    await denied(() => query('rae', 'UPDATE public.reports SET reason=$1', ['other']));
    await denied(() => query('rae', 'DELETE FROM public.reports'));
  } finally { await k.db.close(); }
});

test('photo limits: 20 unsaved drafts and 500 photos per account', async () => {
  const k = await setup(['uma', 'vic']);
  const { people, query, admin } = k;
  try {
    const drafts = [];
    for (let i = 0; i < 20; i++) drafts.push(await k.photo('uma'));
    await denied(() => k.photo('uma'), 'CB001');
    await k.photo('vic');
    // Saving one draft to a recipe makes room for another.
    const book = await k.book('uma', 'Uma');
    await k.recipe('uma', book, drafts[0].id);
    await k.photo('uma');
    await denied(() => k.photo('uma'), 'CB001');
    // Seed the account up to the overall limit without running triggers.
    await admin("SET session_replication_role = 'replica'");
    await admin("INSERT INTO public.social_photos(id,owner_id,path) SELECT id, $1::uuid, $1::uuid::text || '/' || id::text || '.webp' FROM (SELECT gen_random_uuid() AS id FROM generate_series(1, 479)) seeded", [people.uma]);
    await admin("SET session_replication_role = 'origin'");
    assert.equal(Number((await admin('SELECT count(*) AS n FROM public.social_photos WHERE owner_id=$1', [people.uma])).rows[0].n), 500);
    await denied(() => k.photo('uma'), 'CB002');
    // Uploads must still be filed under the uploader's own id.
    const forged = randomUUID();
    await denied(() => query('vic', 'INSERT INTO public.social_photos(id,owner_id,path) VALUES($1,$2,$3)', [forged, people.vic, `${people.uma}/${forged}.webp`]));
  } finally { await k.db.close(); }
});
