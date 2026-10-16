import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the unmodified deployment schema in real PostgreSQL (WASM).
// Only Supabase-managed auth/storage tables and JWT claims are substituted.
test('social deployment schema enforces permissions in PostgreSQL', async t => {
  const db = new PGlite();
  const people = Object.fromEntries(['alice', 'bob', 'cara', 'dan', 'eve'].map(name => [name, randomUUID()]));
  const books = Object.fromEntries(['private', 'friends', 'public', 'dan'].map(name => [name, randomUUID()]));
  const recipes = Object.fromEntries(['private', 'friends', 'public', 'second', 'dan'].map(name => [name, randomUUID()]));
  const photo = randomUUID(), draft = randomUUID(), publicPhoto = randomUUID();
  let caraReview;

  async function as(name, callback) {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [name ? people[name] : '']);
    await db.exec(name ? 'SET ROLE authenticated' : 'SET ROLE anon');
    try { return await callback(); }
    finally { await db.exec('RESET ROLE'); }
  }
  const query = (name, sql, params = []) => as(name, () => db.query(sql, params));
  const denied = (operation, code = '42501') => assert.rejects(operation, error => error.code === code, `Expected PostgreSQL ${code}`);
  const ids = result => result.rows.map(row => row.id).sort();
  async function invite(book, name) {
    const result = await query('alice', 'SELECT * FROM public.cookbook_invite_partner($1,$2)', [book, name]);
    return result.rows[0].id;
  }
  async function acceptFriend(from, to) {
    const result = await query(from, 'INSERT INTO public.friendships(requester_id,addressee_id) VALUES($1,$2) RETURNING id', [people[from], people[to]]);
    await query(to, 'SELECT * FROM public.cookbook_accept_friendship($1)', [result.rows[0].id]);
  }
  async function review(name, recipe, rating) {
    return query(name, 'INSERT INTO public.recipe_reviews(recipe_id,user_id,rating,comment) VALUES($1,$2,$3,$4) RETURNING id', [recipe, people[name], rating, 'We cooked this together.']);
  }

  try {
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

    await t.test('account triggers and private cookbook INSERT RETURNING work under the real user role', async () => {
      for (const name of ['private', 'friends', 'public']) {
        const result = await query('alice', 'INSERT INTO public.cookbooks(id,owner_id,name,visibility) VALUES($1,$2,$3,$4) RETURNING id', [books[name], people.alice, `Alice ${name}`, name]);
        assert.deepEqual(ids(result), [books[name]]);
      }
      await query('dan', 'INSERT INTO public.cookbooks(id,owner_id,name,visibility) VALUES($1,$2,$3,$4)', [books.dan, people.dan, 'Dan private', 'private']);
      for (const name of ['private', 'friends', 'public', 'second', 'dan']) {
        const owner = name === 'dan' ? 'dan' : 'alice';
        const book = name === 'second' ? books.public : books[name];
        await query(owner, 'INSERT INTO public.cookbook_recipes(id,cookbook_id,author_id,title,servings,minutes,ingredients,instructions,meat_type,tags) VALUES($1,$2,$3,$4,2,20,$5,$6,$7,$8) RETURNING id', [recipes[name], book, people[owner], `${name} chicken supper`, [{ name: 'Chicken', quantity: 200, unit: 'g' }], ['Cook until done.'], 'Chicken', ['comfort']]);
      }
      const profile = await query('alice', 'SELECT id,username FROM public.profiles WHERE id=$1', [people.alice]);
      assert.equal(profile.rows[0].username, 'alice');
      const members = await query('alice', 'SELECT role,status FROM public.cookbook_members WHERE cookbook_id=$1', [books.private]);
      assert.deepEqual(members.rows, [{ role: 'owner', status: 'accepted' }]);
      await denied(() => query('alice', 'UPDATE public.cookbooks SET owner_id=$1 WHERE id=$2', [people.dan, books.private]));
    });

    await t.test('anonymous users cannot read the community, while strangers see only public cookbooks', async () => {
      await denied(() => query(null, 'SELECT * FROM public.cookbooks'));
      await denied(() => query(null, 'SELECT public.cookbook_is_member($1)', [books.public]));
      assert.deepEqual(ids(await query('eve', 'SELECT id FROM public.cookbooks')), [books.public]);
      assert.deepEqual(ids(await query('eve', 'SELECT id FROM public.cookbook_recipes')), [recipes.public, recipes.second].sort());
      const changes = await query('eve', 'UPDATE public.cookbook_recipes SET title=$1 WHERE id=$2 RETURNING id', ['Taken over', recipes.public]);
      assert.equal(changes.rows.length, 0);
      const search = await query('eve', 'SELECT public.cookbook_search($1,$2,$3,$4) AS result', ['private', '', '', '']);
      assert.equal(search.rows[0].result.recipes.length, 0);
      assert.equal(search.rows[0].result.cookbooks.length, 0);
    });

    await t.test('friendships require the recipient to accept and following grants no private access', async () => {
      const request = await query('cara', 'INSERT INTO public.friendships(requester_id,addressee_id) VALUES($1,$2) RETURNING id', [people.cara, people.alice]);
      assert.deepEqual(ids(await query('cara', 'SELECT id FROM public.cookbooks')), [books.public]);
      await denied(() => query('cara', 'SELECT * FROM public.cookbook_accept_friendship($1)', [request.rows[0].id]), 'P0002');
      await query('alice', 'SELECT * FROM public.cookbook_accept_friendship($1)', [request.rows[0].id]);
      assert.deepEqual(ids(await query('cara', 'SELECT id FROM public.cookbooks')), [books.friends, books.public].sort());
      await query('cara', 'INSERT INTO public.cookbook_follows(user_id,cookbook_id) VALUES($1,$2)', [people.cara, books.friends]);
      await denied(() => query('cara', 'INSERT INTO public.cookbook_follows(user_id,cookbook_id) VALUES($1,$2)', [people.cara, books.private]));
      await denied(() => query('cara', 'INSERT INTO public.cookbook_follows(user_id,cookbook_id) VALUES($1,$2)', [people.dan, books.public]));
      assert.equal((await query('cara', 'SELECT id FROM public.cookbooks WHERE id=$1', [books.private])).rows.length, 0);
    });

    await t.test('global search matches usernames, cookbook names, recipes, meal types, proteins and tags', async () => {
      const search = async (q = '', category = '', protein = '', tag = '') => (await query('dan', 'SELECT public.cookbook_search($1,$2,$3,$4) AS result', [q, category, protein, tag])).rows[0].result;
      assert.deepEqual((await search('bob')).profiles.map(person => person.username), ['bob']);
      assert.deepEqual((await search('Alice public')).cookbooks.map(book => book.id), [books.public]);
      assert.deepEqual((await search('chicken', 'Dinner', 'Chicken', 'comfort')).recipes.map(recipe => recipe.id).sort(), [recipes.public, recipes.second, recipes.dan].sort());
      assert.equal((await search('', 'Breakfast')).recipes.length, 0);
      assert.equal((await search('', '', '', 'not-a-label')).recipes.length, 0);
      assert.equal((await search('private chicken')).recipes.length, 0);
    });

    await t.test('only accepted partners can edit, and friends of either member can read friends cookbooks', async () => {
      const invitation = await invite(books.private, 'bob');
      assert.equal((await query('bob', 'SELECT id FROM public.cookbooks WHERE id=$1', [books.private])).rows.length, 0);
      await query('bob', 'SELECT * FROM public.cookbook_accept_invitation($1)', [invitation]);
      const saved = await query('bob', 'UPDATE public.cookbook_recipes SET title=$1 WHERE id=$2 RETURNING title', ['Our private supper', recipes.private]);
      assert.equal(saved.rows[0].title, 'Our private supper');
      await denied(() => query('bob', 'UPDATE public.cookbook_recipes SET author_id=$1 WHERE id=$2', [people.bob, recipes.private]));
      const friendsInvitation = await invite(books.friends, 'bob');
      await query('bob', 'SELECT * FROM public.cookbook_accept_invitation($1)', [friendsInvitation]);
      await acceptFriend('eve', 'bob');
      assert.equal((await query('eve', 'SELECT id FROM public.cookbooks WHERE id=$1', [books.friends])).rows.length, 1);
      assert.equal((await query('eve', 'SELECT id FROM public.cookbooks WHERE id=$1', [books.private])).rows.length, 0);
      await denied(() => query('alice', 'SELECT * FROM public.cookbook_invite_partner($1,$2)', [books.private, 'dan']), '22023');
    });

    await t.test('ratings enforce 1–5, one review per person, no self reviews, and the correct cookbook average', async () => {
      caraReview = (await review('cara', recipes.public, 5)).rows[0].id;
      await review('dan', recipes.public, 3);
      await review('eve', recipes.public, 1);
      await review('cara', recipes.second, 5);
      await denied(() => review('dan', recipes.second, 0), '23514');
      await denied(() => review('dan', recipes.second, 6), '23514');
      await denied(() => review('cara', recipes.public, 4), '23505');
      await denied(() => review('alice', recipes.public, 4));
      await denied(() => query('cara', 'UPDATE public.recipe_reviews SET recipe_id=$1 WHERE id=$2', [recipes.second, caraReview]));
      let stats = (await query('dan', 'SELECT rating,review_count FROM public.cookbook_stats WHERE id=$1', [books.public])).rows[0];
      assert.equal(Number(stats.rating), 3.5);
      assert.equal(Number(stats.review_count), 4);
      await review('bob', recipes.public, 2);
      const invitation = await invite(books.public, 'bob');
      await query('bob', 'SELECT * FROM public.cookbook_accept_invitation($1)', [invitation]);
      await denied(() => review('bob', recipes.public, 5));
      stats = (await query('dan', 'SELECT rating,review_count FROM public.cookbook_stats WHERE id=$1', [books.public])).rows[0];
      assert.equal(Number(stats.rating), 3.5);
      assert.equal(Number(stats.review_count), 4);
    });

    await t.test('only the reviewer and cookbook members can reply to a review', async () => {
      for (const name of ['cara', 'alice', 'bob']) {
        await query(name, 'INSERT INTO public.review_replies(review_id,user_id,comment) VALUES($1,$2,$3)', [caraReview, people[name], 'Thank you for trying it.']);
      }
      await denied(() => query('dan', 'INSERT INTO public.review_replies(review_id,user_id,comment) VALUES($1,$2,$3)', [caraReview, people.dan, 'Unrelated reply']));
      assert.equal((await query('eve', 'SELECT id FROM public.review_replies WHERE review_id=$1', [caraReview])).rows.length, 3);
      assert.equal(Number((await query('eve', 'SELECT review_count FROM public.cookbook_stats WHERE id=$1', [books.public])).rows[0].review_count), 4);
    });

    await t.test('shared planners require membership, readable recipes and a current version', async () => {
      const state = { cart: [{ recipeId: recipes.private, servings: 4 }], checked: { 'chicken|g|400': true } };
      const saved = await query('alice', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, state, 0]);
      assert.equal(saved.rows[0].version, 1);
      assert.deepEqual(saved.rows[0].state, state);
      const stale = await query('bob', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, state, 0]);
      assert.equal(stale.rows.length, 0);
      await denied(() => query('dan', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, state, 1]));
      await denied(() => query('bob', 'UPDATE public.cookbook_planners SET version=7 WHERE cookbook_id=$1', [books.private]));
      await denied(() => query('bob', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, { cart: [{ recipeId: recipes.dan, servings: 2 }], checked: {} }, 1]), '22023');
      await denied(() => query('bob', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, { cart: [{ recipeId: recipes.private, servings: 2 }, { recipeId: recipes.private, servings: 2 }], checked: {} }, 1]), '22023');
      assert.equal((await query('bob', 'SELECT version FROM public.cookbook_planners WHERE cookbook_id=$1', [books.private])).rows[0].version, 1);
    });

    await t.test('couples can try external recipes directly only while every accepted member can read the source', async () => {
      const destination = randomUUID(), source = randomUUID(), sourceRecipe = randomUUID();
      await query('alice', 'INSERT INTO public.cookbooks(id,owner_id,name) VALUES($1,$2,$3)', [destination, people.alice, 'Our tasting list']);
      await query('dan', 'INSERT INTO public.cookbooks(id,owner_id,name,visibility) VALUES($1,$2,$3,$4)', [source, people.dan, 'Dan friends recipes', 'friends']);
      await query('dan', 'INSERT INTO public.cookbook_recipes(id,cookbook_id,author_id,title,servings,minutes,ingredients,instructions) VALUES($1,$2,$3,$4,2,20,$5,$6)', [sourceRecipe, source, people.dan, 'Try before saving', [{ name: 'Rice', quantity: 200, unit: 'g' }], ['Cook the rice.']]);
      await acceptFriend('alice', 'dan');
      const invitation = await invite(destination, 'bob');
      const state = { cart: [{ recipeId: sourceRecipe, servings: 3, title: 'A content snapshot must not be stored', instructions: ['Private content'] }], checked: { 'rice|g|300': true } };
      const canonical = { cart: [{ recipeId: sourceRecipe, servings: 3 }], checked: state.checked };
      const saved = (await query('alice', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [destination, state, 0])).rows[0];
      assert.deepEqual(saved.state, canonical, 'Pending partners do not add access requirements; source content is not copied');
      assert.equal((await query('alice', 'SELECT id FROM public.cookbook_recipes WHERE cookbook_id=$1', [destination])).rows.length, 0, 'Trying a recipe creates no cookbook copy');
      await denied(() => query('alice', 'SELECT public.cookbook_can_read_as($1,$2)', [source, people.bob]));
      await denied(() => query('eve', 'SELECT * FROM public.cookbook_get_planner($1)', [destination]));
      await query('bob', 'SELECT * FROM public.cookbook_accept_invitation($1)', [invitation]);
      assert.equal((await query('alice', 'SELECT id FROM public.cookbook_recipes WHERE id=$1', [sourceRecipe])).rows.length, 1);
      assert.equal((await query('bob', 'SELECT id FROM public.cookbook_recipes WHERE id=$1', [sourceRecipe])).rows.length, 0);
      for (const member of ['alice', 'bob']) {
        const filtered = (await query(member, 'SELECT * FROM public.cookbook_get_planner($1)', [destination])).rows[0];
        assert.deepEqual(filtered.state, { cart: [], checked: {} });
        assert.equal(filtered.version, 1);
        await denied(() => query(member, 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [destination, canonical, 1]), '22023');
      }
      await acceptFriend('bob', 'dan');
      assert.deepEqual((await query('bob', 'SELECT * FROM public.cookbook_get_planner($1)', [destination])).rows[0].state, canonical);
      await query('dan', 'UPDATE public.cookbooks SET visibility=$1 WHERE id=$2', ['public', source]);
      await query('bob', 'DELETE FROM public.friendships WHERE requester_id=$1 AND addressee_id=$2', [people.bob, people.dan]);
      assert.deepEqual((await query('bob', 'SELECT * FROM public.cookbook_get_planner($1)', [destination])).rows[0].state, canonical, 'Public recipes remain available without friendship');
      await query('dan', 'UPDATE public.cookbooks SET visibility=$1 WHERE id=$2', ['friends', source]);
      const filtered = (await query('alice', 'SELECT * FROM public.cookbook_get_planner($1)', [destination])).rows[0];
      assert.deepEqual(filtered.state, { cart: [], checked: {} }, 'Lost friendship removes the source from both partners’ usable list');
      const cleaned = (await query('alice', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [destination, filtered.state, filtered.version])).rows[0];
      assert.equal(cleaned.version, 2, 'A sanitized list can be saved at the existing CAS version');
      assert.deepEqual(cleaned.state, { cart: [], checked: {} });
    });

    await t.test('deleting an external source recipe cleans every referencing planner and advances each version', async () => {
      const source = randomUUID(), sourceRecipe = randomUUID(), first = randomUUID(), second = randomUUID();
      await query('dan', 'INSERT INTO public.cookbooks(id,owner_id,name,visibility) VALUES($1,$2,$3,$4)', [source, people.dan, 'Public tasting source', 'public']);
      await query('dan', 'INSERT INTO public.cookbook_recipes(id,cookbook_id,author_id,title,servings,minutes,ingredients,instructions) VALUES($1,$2,$3,$4,2,20,$5,$6)', [sourceRecipe, source, people.dan, 'One-time taste', [{ name: 'Rice', quantity: 200, unit: 'g' }], ['Cook the rice.']]);
      for (const [book, owner] of [[first, 'alice'], [second, 'eve']]) {
        await query(owner, 'INSERT INTO public.cookbooks(id,owner_id,name) VALUES($1,$2,$3)', [book, people[owner], 'Tasting list']);
        await query(owner, 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [book, { cart: [{ recipeId: sourceRecipe, servings: 2 }], checked: { 'rice|g|200': true } }, 0]);
      }
      await query('dan', 'DELETE FROM public.cookbook_recipes WHERE id=$1', [sourceRecipe]);
      for (const [book, owner] of [[first, 'alice'], [second, 'eve']]) {
        const planner = (await query(owner, 'SELECT * FROM public.cookbook_get_planner($1)', [book])).rows[0];
        assert.equal(planner.version, 2);
        assert.deepEqual(planner.state, { cart: [], checked: {} });
        assert.equal((await query(owner, 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [book, planner.state, planner.version])).rows[0].version, 3);
      }
    });

    await t.test('deleting a planned recipe preserves other meals and leaves the shared planner writable', async () => {
      const removedRecipe = randomUUID();
      await query('alice', 'INSERT INTO public.cookbook_recipes(id,cookbook_id,author_id,title,servings,minutes,ingredients,instructions) VALUES($1,$2,$3,$4,2,20,$5,$6)', [removedRecipe, books.private, people.alice, 'One-time supper', [{ name: 'Rice', quantity: 200, unit: 'g' }], ['Cook the rice.']]);
      const keptMeal = { recipeId: recipes.private, servings: 4 };
      const planned = await query('alice', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, { cart: [keptMeal, { recipeId: removedRecipe, servings: 2 }], checked: { 'rice|g|200': true, 'chicken|g|400': true } }, 1]);
      assert.equal(planned.rows[0].version, 2);
      await query('bob', 'DELETE FROM public.cookbook_recipes WHERE id=$1 RETURNING id', [removedRecipe]);
      const cleaned = (await query('alice', 'SELECT state,version FROM public.cookbook_planners WHERE cookbook_id=$1', [books.private])).rows[0];
      assert.deepEqual(cleaned.state, { cart: [keptMeal], checked: {} });
      assert.equal(cleaned.version, 3);
      const stale = await query('alice', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, cleaned.state, 2]);
      assert.equal(stale.rows.length, 0);
      const nextState = { cart: [{ recipeId: recipes.private, servings: 3 }], checked: {} };
      const saved = await query('bob', 'SELECT * FROM public.cookbook_save_planner($1,$2,$3)', [books.private, nextState, cleaned.version]);
      assert.deepEqual(saved.rows[0].state, nextState);
      assert.equal(saved.rows[0].version, 4);
    });

    await t.test('private photo metadata and storage enforce uploader ownership and cookbook visibility', async () => {
      for (const [name, photoId] of [['alice', photo], ['bob', draft], ['alice', publicPhoto]]) {
        const path = `${people[name]}/${photoId}.webp`;
        const metadata = await query(name, 'INSERT INTO public.social_photos(id,owner_id,path) VALUES($1,$2,$3) RETURNING id', [photoId, people[name], path]);
        assert.deepEqual(ids(metadata), [photoId]);
        await query(name, 'INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', ['social-recipe-photos', path]);
      }
      assert.equal((await query('dan', 'SELECT id FROM public.social_photos WHERE id=$1', [photo])).rows.length, 0);
      assert.equal((await query('dan', 'SELECT id FROM storage.objects WHERE name=$1', [`${people.alice}/${photo}.webp`])).rows.length, 0);
      await denied(() => query('alice', 'UPDATE public.cookbook_recipes SET image_id=$1 WHERE id=$2', [draft, recipes.private]));
      await query('alice', 'UPDATE public.cookbook_recipes SET image_id=$1 WHERE id=$2', [photo, recipes.private]);
      await query('bob', 'UPDATE public.cookbook_recipes SET title=$1,image_id=$2 WHERE id=$3', ['Partner keeps our photo', photo, recipes.private]);
      assert.equal((await query('bob', 'SELECT id FROM storage.objects WHERE name=$1', [`${people.alice}/${photo}.webp`])).rows.length, 1);
      assert.equal((await query('alice', 'DELETE FROM public.social_photos WHERE id=$1 RETURNING id', [photo])).rows.length, 0);
      assert.equal((await query('alice', 'DELETE FROM storage.objects WHERE name=$1 RETURNING id', [`${people.alice}/${photo}.webp`])).rows.length, 0);
      await query('alice', 'UPDATE public.cookbook_recipes SET image_id=$1 WHERE id=$2', [publicPhoto, recipes.public]);
      assert.equal((await query('dan', 'SELECT id FROM public.social_photos WHERE id=$1', [publicPhoto])).rows.length, 1);
      await denied(() => query('dan', 'UPDATE public.cookbook_recipes SET image_id=$1 WHERE id=$2', [publicPhoto, recipes.dan]));
      const forgedPhoto = randomUUID();
      await denied(() => query('dan', 'INSERT INTO public.social_photos(id,owner_id,path) VALUES($1,$2,$3)', [forgedPhoto, people.alice, `${people.alice}/${forgedPhoto}.webp`]));
      await denied(() => query('dan', 'INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', ['social-recipe-photos', `${people.alice}/${randomUUID()}.webp`]));
      assert.equal((await query('alice', 'DELETE FROM public.social_photos WHERE id=$1 RETURNING id', [draft])).rows.length, 0);
      assert.equal((await query('bob', 'DELETE FROM public.social_photos WHERE id=$1 RETURNING id', [draft])).rows.length, 1);
      assert.equal((await query('bob', 'DELETE FROM storage.objects WHERE name=$1 RETURNING id', [`${people.bob}/${draft}.webp`])).rows.length, 1);
    });
  } finally {
    await db.close();
  }
});
