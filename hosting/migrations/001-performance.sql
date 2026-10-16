-- Performance upgrade for a social database created from an earlier
-- hosting/social-schema.sql. Fresh projects already include all of this.
-- Safe to run more than once in the Supabase SQL editor. It changes no data,
-- policies or grants: CREATE OR REPLACE FUNCTION keeps existing privileges.

-- Lookup indexes. RLS helpers run once per candidate row, so every column they
-- probe (and every foreign key that cascades) needs an index to stay O(log n).
create index if not exists cookbook_members_user on public.cookbook_members(user_id,status);
create index if not exists friendships_requester on public.friendships(requester_id,status);
create index if not exists friendships_addressee on public.friendships(addressee_id,status);
create index if not exists cookbooks_owner on public.cookbooks(owner_id);
create index if not exists cookbooks_created on public.cookbooks(created_at desc);
create index if not exists cookbooks_cover_image on public.cookbooks(cover_image_id) where cover_image_id is not null;
create index if not exists cookbook_recipes_created on public.cookbook_recipes(created_at desc);
create index if not exists cookbook_recipes_author on public.cookbook_recipes(author_id);
create index if not exists cookbook_recipes_image on public.cookbook_recipes(image_id) where image_id is not null;
create index if not exists cookbook_follows_book on public.cookbook_follows(cookbook_id);
create index if not exists recipe_reviews_user on public.recipe_reviews(user_id);
create index if not exists recipe_reviews_created on public.recipe_reviews(created_at desc);
create index if not exists review_replies_review on public.review_replies(review_id,created_at);
create index if not exists review_replies_user on public.review_replies(user_id);
create index if not exists social_photos_owner on public.social_photos(owner_id);
create index if not exists cookbook_planners_cart on public.cookbook_planners using gin((state->'cart') jsonb_path_ops);

-- Same visibility rule; the friends check now probes friendship_unique_pair.
create or replace function public.cookbook_can_read_as(book uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select viewer is not null and exists(
    select 1 from public.cookbooks b where b.id=book and (
      b.visibility='public' or exists(select 1 from public.cookbook_members own where own.cookbook_id=b.id and own.user_id=viewer and own.status='accepted') or (
        -- Probe each member's unordered pair through friendship_unique_pair
        -- instead of scanning every accepted friendship in the database.
        b.visibility='friends' and exists(select 1 from public.cookbook_members m join public.friendships f
          on least(f.requester_id,f.addressee_id)=least(viewer,m.user_id) and greatest(f.requester_id,f.addressee_id)=greatest(viewer,m.user_id)
          where m.cookbook_id=b.id and m.status='accepted' and f.status='accepted')
      )
    )
  );
$$;

-- Same cleanup; the WHERE clause now uses cookbook_planners_cart.
create or replace function public.cookbook_recipe_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.cookbook_planners p
    set state=jsonb_build_object(
      'cart',coalesce((select jsonb_agg(item order by position)
        from jsonb_array_elements(p.state->'cart') with ordinality entries(item,position)
        where item->>'recipeId'<>old.id::text),'[]'::jsonb),
      'checked','{}'::jsonb),
      version=p.version+1, updated_at=now()
    where p.state->'cart' @> jsonb_build_array(jsonb_build_object('recipeId',old.id::text));
  return old;
end;
$$;

analyze public.cookbook_members, public.friendships, public.cookbooks, public.cookbook_recipes,
  public.cookbook_follows, public.recipe_reviews, public.review_replies, public.social_photos, public.cookbook_planners;
