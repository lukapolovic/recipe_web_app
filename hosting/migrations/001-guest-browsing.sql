-- Guest browsing: people without an account (the anon role) may read public
-- cookbooks, their recipes, photos, ratings and conversations, and the cooks
-- behind them. Everything they could write, and every private or
-- friends-only cookbook, stays closed to them. Safe to run twice.
begin;

-- Guests (no signed-in user) read public cookbooks only.
create or replace function public.cookbook_can_read(book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null
    then exists(select 1 from public.cookbooks b where b.id=book and b.visibility='public')
    else public.cookbook_can_read_as(book,auth.uid()) end;
$$;

-- Guests see the cooks behind public pages: members of a public cookbook, and
-- people who wrote a recipe, review or reply in one. Everyone else is visible
-- to signed-in members only.
create or replace function public.cookbook_profile_public(person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cookbook_members m join public.cookbooks b on b.id=m.cookbook_id
      where m.user_id=person and m.status='accepted' and b.visibility='public')
    or exists(select 1 from public.cookbook_recipes r join public.cookbooks b on b.id=r.cookbook_id
      where r.author_id=person and b.visibility='public')
    or exists(select 1 from public.recipe_reviews v join public.cookbook_recipes r on r.id=v.recipe_id join public.cookbooks b on b.id=r.cookbook_id
      where v.user_id=person and b.visibility='public')
    or exists(select 1 from public.review_replies x join public.recipe_reviews v on v.id=x.review_id join public.cookbook_recipes r on r.id=v.recipe_id join public.cookbooks b on b.id=r.cookbook_id
      where x.user_id=person and b.visibility='public');
$$;
revoke all on function public.cookbook_profile_public(uuid) from public, anon, authenticated;

-- Read policies apply to guests too; cookbook_can_read keeps them to public cookbooks.
drop policy if exists photos_read on public.social_photos;
create policy photos_read on public.social_photos for select to anon, authenticated using(owner_id=auth.uid() or public.cookbook_photo_readable(id));
drop policy if exists books_read on public.cookbooks;
create policy books_read on public.cookbooks for select to anon, authenticated using(owner_id=auth.uid() or public.cookbook_can_read(id));
drop policy if exists members_read on public.cookbook_members;
create policy members_read on public.cookbook_members for select to anon, authenticated using(user_id=auth.uid() or public.cookbook_is_member(cookbook_id) or (status='accepted' and public.cookbook_can_read(cookbook_id)));
drop policy if exists recipes_read on public.cookbook_recipes;
create policy recipes_read on public.cookbook_recipes for select to anon, authenticated using(public.cookbook_can_read(cookbook_id));
drop policy if exists reviews_read on public.recipe_reviews;
create policy reviews_read on public.recipe_reviews for select to anon, authenticated using(public.cookbook_can_read_recipe(recipe_id));
drop policy if exists replies_read on public.review_replies;
create policy replies_read on public.review_replies for select to anon, authenticated using(public.cookbook_can_read_review(review_id));
drop policy if exists profiles_read_guest on public.profiles;
create policy profiles_read_guest on public.profiles for select to anon using(public.cookbook_profile_public(id));

-- Read access only: friendships, follows, planners and reports stay closed to guests.
grant select on public.social_photos,public.profiles,public.cookbooks,public.cookbook_members,public.cookbook_recipes,public.recipe_reviews,public.review_replies,public.cookbook_stats,public.recipe_stats to anon;
grant execute on function public.cookbook_is_member(uuid),public.cookbook_can_read(uuid),public.cookbook_can_read_recipe(uuid),public.cookbook_can_read_review(uuid),public.cookbook_photo_readable(uuid),public.cookbook_storage_readable(text),public.cookbook_profile_public(uuid),public.cookbook_my_memberships(),public.cookbook_search(text,text,text,text) to anon, authenticated;

-- Guests may download the files of photos they can see (no orphan or ownership rules: they own nothing).
drop policy if exists cookbook_photo_select_guest on storage.objects;
create policy cookbook_photo_select_guest on storage.objects for select to anon
  using(bucket_id='social-recipe-photos' and public.cookbook_storage_readable(name));

commit;
