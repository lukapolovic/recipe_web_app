-- Thyme & Two: run in a NEW Supabase project's SQL editor.
-- This schema is separate from the older single-household `recipes` prototype.
-- Use SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).
-- Never give the web app a service-role / secret key: every data request uses
-- the signed-in user's access token and the row-level policies below.

-- ---------------------------------------------------------------------------
-- Keepalive. The daily Vercel Cron (GET /api/cron/keepalive) calls this through
-- the publishable key so the Free plan sees database activity and does not
-- pause the project. It reads nothing and runs with the caller's (anon) rights.
create or replace function public.keepalive() returns timestamptz
language sql stable security invoker set search_path = '' as $$ select now(); $$;
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  bio text not null default '' check (length(bio) <= 500),
  created_at timestamptz not null default now()
);
create table public.social_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  path text not null unique check(path=owner_id::text || '/' || id::text || '.webp'),
  created_at timestamptz not null default now()
);
create table public.cookbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 1000),
  visibility text not null default 'private' check (visibility in ('public','friends','private')),
  cover_image_id uuid references public.social_photos(id),
  cover_color text not null default 'rose' check(cover_color in ('rose','olive','ochre','terracotta')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cookbook_members (
  id uuid primary key default gen_random_uuid(),
  cookbook_id uuid not null references public.cookbooks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','partner')),
  status text not null default 'invited' check (status in ('invited','accepted')),
  created_at timestamptz not null default now(),
  unique(cookbook_id,user_id)
);
create unique index cookbook_one_owner on public.cookbook_members(cookbook_id) where role = 'owner';
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check(requester_id <> addressee_id)
);
create unique index friendship_unique_pair on public.friendships
  (least(requester_id,addressee_id),greatest(requester_id,addressee_id));
create table public.cookbook_recipes (
  id uuid primary key default gen_random_uuid(),
  cookbook_id uuid not null references public.cookbooks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(btrim(title)) between 1 and 120),
  description text not null default '' check(length(description) <= 600),
  category text not null default 'Dinner' check(category in ('Breakfast','Lunch','Snack','Shake','Dinner')),
  meat_type text not null default 'None' check(meat_type in ('None','Vegetarian','Chicken','Beef','Pork','Lamb','Turkey','Fish','Seafood','Mixed','Other')),
  diet text not null default 'None' check(diet in ('None','Vegetarian','Vegan','Gluten-free')),
  tags text[] not null default '{}' check(cardinality(tags) <= 12),
  servings integer not null check(servings between 1 and 100),
  minutes integer not null check(minutes between 1 and 1440),
  ingredients jsonb not null check(jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) between 1 and 100),
  instructions jsonb not null check(jsonb_typeof(instructions) = 'array' and jsonb_array_length(instructions) between 1 and 100),
  image_id uuid references public.social_photos(id), source_url text not null default '' check(length(source_url) <= 2000),
  source_calories double precision check(source_calories between 0 and 100000),
  color text not null default 'sage',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index cookbook_recipes_book on public.cookbook_recipes(cookbook_id,created_at desc);
create index cookbook_recipes_tags on public.cookbook_recipes using gin(tags);
create table public.cookbook_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cookbook_id uuid not null references public.cookbooks(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,cookbook_id)
);
create table public.recipe_reviews (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.cookbook_recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check(rating between 1 and 5),
  comment text not null check(length(btrim(comment)) between 1 and 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(recipe_id,user_id)
);
create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.recipe_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null check(length(btrim(comment)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table public.cookbook_planners (
  cookbook_id uuid primary key references public.cookbooks(id) on delete cascade,
  state jsonb not null default '{"cart":[],"checked":{}}'::jsonb,
  version integer not null default 0 check(version >= 0),
  updated_at timestamptz not null default now()
);

-- Lookup indexes. RLS helpers run once per candidate row, so every column they
-- probe (and every foreign key that cascades) needs an index to stay O(log n).
create index cookbook_members_user on public.cookbook_members(user_id,status);
create index friendships_requester on public.friendships(requester_id,status);
create index friendships_addressee on public.friendships(addressee_id,status);
create index cookbooks_owner on public.cookbooks(owner_id);
create index cookbooks_created on public.cookbooks(created_at desc);
create index cookbooks_cover_image on public.cookbooks(cover_image_id) where cover_image_id is not null;
create index cookbook_recipes_created on public.cookbook_recipes(created_at desc);
create index cookbook_recipes_author on public.cookbook_recipes(author_id);
create index cookbook_recipes_image on public.cookbook_recipes(image_id) where image_id is not null;
create index cookbook_follows_book on public.cookbook_follows(cookbook_id);
create index recipe_reviews_user on public.recipe_reviews(user_id);
create index recipe_reviews_created on public.recipe_reviews(created_at desc);
create index review_replies_review on public.review_replies(review_id,created_at);
create index review_replies_user on public.review_replies(user_id);
create index social_photos_owner on public.social_photos(owner_id);
-- Lets the recipe-deletion trigger find referencing shopping lists without
-- unpacking every planner in the database.
create index cookbook_planners_cart on public.cookbook_planners using gin((state->'cart') jsonb_path_ops);

-- Definer helpers avoid recursive membership/friendship RLS. They return only
-- permissions for the current JWT user, never arbitrary table contents.
create function public.cookbook_is_member(book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cookbook_members m where m.cookbook_id=book and m.user_id=auth.uid() and m.status='accepted');
$$;
create function public.cookbook_is_owner(book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cookbooks b where b.id=book and b.owner_id=auth.uid());
$$;
-- Internal helper evaluates the same visibility rule for each accepted partner
-- before a source recipe may enter their shared planner. Arbitrary viewers are
-- not exposed through an RPC: cookbook_can_read checks only the current user.
create function public.cookbook_can_read_as(book uuid, viewer uuid) returns boolean
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
revoke all on function public.cookbook_can_read_as(uuid,uuid) from public,anon,authenticated;
create function public.cookbook_can_read(book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cookbook_can_read_as(book,auth.uid());
$$;
create function public.cookbook_can_read_recipe(recipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cookbook_recipes r where r.id=recipe and public.cookbook_can_read(r.cookbook_id));
$$;
create function public.cookbook_can_review(recipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cookbook_recipes r where r.id=recipe
    and public.cookbook_can_read(r.cookbook_id) and not public.cookbook_is_member(r.cookbook_id));
$$;
create function public.cookbook_can_read_review(review uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.recipe_reviews v where v.id=review and public.cookbook_can_read_recipe(v.recipe_id));
$$;
create function public.cookbook_can_reply(review uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.recipe_reviews v join public.cookbook_recipes r on r.id=v.recipe_id
    where v.id=review and public.cookbook_can_read(r.cookbook_id)
      and (v.user_id=auth.uid() or public.cookbook_is_member(r.cookbook_id)));
$$;
create function public.cookbook_photo_owned(photo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select photo is null or exists(select 1 from public.social_photos p where p.id=photo and p.owner_id=auth.uid());
$$;
create function public.cookbook_photo_attachable(photo uuid, book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select photo is null or public.cookbook_photo_owned(photo) or (
    public.cookbook_is_member(book) and (
      exists(select 1 from public.cookbook_recipes r where r.cookbook_id=book and r.image_id=photo)
      or exists(select 1 from public.cookbooks b where b.id=book and b.cover_image_id=photo)
    )
  );
$$;
create function public.cookbook_photo_readable(photo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cookbook_photo_owned(photo) or (
    exists(select 1 from public.cookbook_recipes r where r.image_id=photo and public.cookbook_can_read(r.cookbook_id))
    or exists(select 1 from public.cookbooks b where b.cover_image_id=photo and public.cookbook_can_read(b.id))
  );
$$;
create function public.cookbook_photo_unattached(photo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.cookbook_recipes r where r.image_id=photo)
    and not exists(select 1 from public.cookbooks b where b.cover_image_id=photo);
$$;
create function public.cookbook_storage_readable(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.social_photos p where p.path=object_path and public.cookbook_photo_readable(p.id));
$$;
create function public.cookbook_storage_owned(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select object_path ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.webp$');
$$;
create function public.cookbook_storage_unattached(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.social_photos p where p.path=object_path and not public.cookbook_photo_unattached(p.id));
$$;

create function public.cookbook_touch_updated() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger cookbook_touch before update on public.cookbooks for each row execute function public.cookbook_touch_updated();
create trigger recipe_touch before update on public.cookbook_recipes for each row execute function public.cookbook_touch_updated();
create trigger review_touch before update on public.recipe_reviews for each row execute function public.cookbook_touch_updated();

create function public.cookbook_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,username,display_name)
  values(new.id,lower(new.raw_user_meta_data->>'username'),coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),new.raw_user_meta_data->>'username'));
  return new;
end;
$$;
create trigger cookbook_auth_user after insert on auth.users for each row execute function public.cookbook_new_user();
create function public.cookbook_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cookbook_members(cookbook_id,user_id,role,status) values(new.id,new.owner_id,'owner','accepted');
  insert into public.cookbook_planners(cookbook_id) values(new.id);
  return new;
end;
$$;
create trigger cookbook_create_members after insert on public.cookbooks for each row execute function public.cookbook_created();

-- These functions lock the cookbook so simultaneous invitations/acceptances
-- cannot create more than the owner and one accepted partner.
create function public.cookbook_invite_partner(book uuid, partner_username text)
returns public.cookbook_members language plpgsql security definer set search_path = '' as $$
declare target uuid; result public.cookbook_members;
begin
  perform 1 from public.cookbooks where id=book and owner_id=auth.uid() for update;
  if not found then raise exception 'Only the cookbook owner can invite a partner.' using errcode='42501'; end if;
  select id into target from public.profiles where username=lower(btrim(partner_username));
  if target is null then raise exception 'Username not found.' using errcode='P0002'; end if;
  if target=auth.uid() then raise exception 'Choose your partner''s username.' using errcode='22023'; end if;
  if exists(select 1 from public.cookbook_members where cookbook_id=book and user_id<>target and role='partner') then
    raise exception 'This cookbook already has a partner or pending invitation.' using errcode='22023';
  end if;
  insert into public.cookbook_members(cookbook_id,user_id,role,status) values(book,target,'partner','invited')
    on conflict(cookbook_id,user_id) do update set user_id=excluded.user_id returning * into result;
  return result;
end;
$$;
create function public.cookbook_accept_invitation(invitation uuid)
returns public.cookbook_members language plpgsql security definer set search_path = '' as $$
declare book uuid; result public.cookbook_members;
begin
  select cookbook_id into book from public.cookbook_members where id=invitation and user_id=auth.uid() and role='partner';
  if book is null then raise exception 'Invitation not found.' using errcode='P0002'; end if;
  perform 1 from public.cookbooks where id=book for update;
  if (select count(*) from public.cookbook_members where cookbook_id=book and status='accepted' and user_id<>auth.uid())>=2 then
    raise exception 'This cookbook already has two members.' using errcode='22023';
  end if;
  -- Becoming a coauthor removes previous ratings of this cookbook.
  delete from public.recipe_reviews v using public.cookbook_recipes r where v.recipe_id=r.id and r.cookbook_id=book and v.user_id=auth.uid();
  update public.cookbook_members set status='accepted' where id=invitation and user_id=auth.uid() returning * into result;
  return result;
end;
$$;
create function public.cookbook_my_memberships() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('cookbook_name',b.name)), '[]'::jsonb)
  from public.cookbook_members m join public.cookbooks b on b.id=m.cookbook_id
  where m.user_id=auth.uid() or public.cookbook_is_member(m.cookbook_id) or (m.status='accepted' and public.cookbook_can_read(m.cookbook_id));
$$;
create function public.cookbook_accept_friendship(friendship uuid)
returns public.friendships language plpgsql security definer set search_path = '' as $$
declare result public.friendships;
begin
  update public.friendships set status='accepted' where id=friendship and addressee_id=auth.uid() returning * into result;
  if result.id is null then raise exception 'Friend request not found.' using errcode='P0002'; end if;
  return result;
end;
$$;
-- A meal can be tried directly from another cookbook without copying it.
-- Only references are kept, and every accepted member of the destination must
-- be able to read the source. A pending invitation grants no extra access.
create function public.cookbook_planner_recipe_available(book uuid, recipe uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.cookbook_is_member(book) and exists(
    select 1 from public.cookbook_recipes r where r.id=recipe
      and not exists(select 1 from public.cookbook_members m
        where m.cookbook_id=book and m.status='accepted'
          and not public.cookbook_can_read_as(r.cookbook_id,m.user_id))
  );
$$;
revoke all on function public.cookbook_planner_recipe_available(uuid,uuid) from public,anon,authenticated;
create function public.cookbook_get_planner(book uuid)
returns setof public.cookbook_planners language plpgsql stable security definer set search_path = '' as $$
declare stored public.cookbook_planners; available_cart jsonb;
begin
  if not public.cookbook_is_member(book) then raise exception 'Only cookbook members can read its shopping list.' using errcode='42501'; end if;
  select * into stored from public.cookbook_planners where cookbook_id=book;
  if not found then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('recipeId',item->>'recipeId','servings',item->'servings') order by position),'[]'::jsonb)
    into available_cart from jsonb_array_elements(stored.state->'cart') with ordinality entries(item,position)
    where public.cookbook_planner_recipe_available(book,(item->>'recipeId')::uuid);
  -- Visibility or friendship may have changed since the last save. The caller
  -- receives a usable list at the existing version, so its next CAS save also
  -- removes stale references. Do not retain checks against changed quantities.
  return query select stored.cookbook_id,jsonb_build_object('cart',available_cart,'checked',
    case when jsonb_array_length(available_cart)=jsonb_array_length(stored.state->'cart') then stored.state->'checked' else '{}'::jsonb end),stored.version,stored.updated_at;
end;
$$;
create function public.cookbook_save_planner(book uuid, new_state jsonb, expected_version integer)
returns setof public.cookbook_planners language plpgsql security definer set search_path = '' as $$
declare canonical_cart jsonb;
begin
  if not public.cookbook_is_member(book) then raise exception 'Only cookbook members can edit its shopping list.' using errcode='42501'; end if;
  if jsonb_typeof(new_state)<>'object' or jsonb_typeof(new_state->'cart') is distinct from 'array'
    or jsonb_array_length(new_state->'cart')>100 or jsonb_typeof(new_state->'checked') is distinct from 'object'
    or expected_version is null or expected_version<0 then
    raise exception 'Provide a valid shopping list.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(new_state->'cart') item where
    jsonb_typeof(item)<>'object' or (item->>'recipeId') is null or (item->>'recipeId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(item->'servings') is distinct from 'number' or (item->>'servings') !~ '^[0-9]{1,3}$') then
    raise exception 'Choose valid recipes and servings.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(new_state->'cart') item where
    (item->>'servings')::integer not between 1 and 100
      or not public.cookbook_planner_recipe_available(book,(item->>'recipeId')::uuid)) then
    raise exception 'Choose recipes that everyone in this cookbook can view.' using errcode='22023';
  end if;
  if (select count(*) from jsonb_array_elements(new_state->'cart'))<>(select count(distinct item->>'recipeId') from jsonb_array_elements(new_state->'cart') item)
    or (select count(*) from jsonb_each(new_state->'checked'))>1000
    or exists(select 1 from jsonb_each(new_state->'checked') item where jsonb_typeof(item.value)<>'boolean' or length(item.key)>500) then
    raise exception 'Provide valid shopping list items.' using errcode='22023';
  end if;
  -- Canonical references prevent direct RPC callers from storing source recipe
  -- snapshots or other fields which could outlive source visibility changes.
  select coalesce(jsonb_agg(jsonb_build_object('recipeId',item->>'recipeId','servings',item->'servings') order by position),'[]'::jsonb)
    into canonical_cart from jsonb_array_elements(new_state->'cart') with ordinality entries(item,position);
  return query update public.cookbook_planners set state=jsonb_build_object('cart',canonical_cart,'checked',new_state->'checked'),version=version+1,updated_at=now()
    where cookbook_id=book and version=expected_version returning *;
end;
$$;


-- Removing a recipe updates every shopping list which references it in the
-- same transaction, including couples trying the recipe from another book.
create function public.cookbook_recipe_deleted() returns trigger
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
create trigger recipe_remove_from_planner after delete on public.cookbook_recipes
  for each row execute function public.cookbook_recipe_deleted();
revoke all on function public.cookbook_recipe_deleted() from public,anon,authenticated;

alter table public.social_photos enable row level security;
alter table public.profiles enable row level security;
alter table public.cookbooks enable row level security;
alter table public.cookbook_members enable row level security;
alter table public.friendships enable row level security;
alter table public.cookbook_recipes enable row level security;
alter table public.cookbook_follows enable row level security;
alter table public.recipe_reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.cookbook_planners enable row level security;

create policy photos_read on public.social_photos for select to authenticated using(owner_id=auth.uid() or public.cookbook_photo_readable(id));
create policy photos_create on public.social_photos for insert to authenticated with check(owner_id=auth.uid());
create policy photos_delete on public.social_photos for delete to authenticated using(owner_id=auth.uid() and public.cookbook_photo_unattached(id));
create policy profiles_read on public.profiles for select to authenticated using(true);
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy books_read on public.cookbooks for select to authenticated using(owner_id=auth.uid() or public.cookbook_can_read(id));
create policy books_create on public.cookbooks for insert to authenticated with check(owner_id=auth.uid() and public.cookbook_photo_owned(cover_image_id));
create policy books_edit on public.cookbooks for update to authenticated using(public.cookbook_is_member(id)) with check(public.cookbook_is_member(id) and public.cookbook_photo_attachable(cover_image_id,id));
create policy books_delete on public.cookbooks for delete to authenticated using(owner_id=auth.uid());
create policy members_read on public.cookbook_members for select to authenticated using(user_id=auth.uid() or public.cookbook_is_member(cookbook_id) or (status='accepted' and public.cookbook_can_read(cookbook_id)));
create policy members_delete on public.cookbook_members for delete to authenticated using(role='partner' and (user_id=auth.uid() or public.cookbook_is_owner(cookbook_id)));
create policy friends_read on public.friendships for select to authenticated using(auth.uid() in (requester_id,addressee_id));
create policy friends_create on public.friendships for insert to authenticated with check(requester_id=auth.uid() and status='pending');
create policy friends_delete on public.friendships for delete to authenticated using(auth.uid() in (requester_id,addressee_id));
create policy recipes_read on public.cookbook_recipes for select to authenticated using(public.cookbook_can_read(cookbook_id));
create policy recipes_create on public.cookbook_recipes for insert to authenticated with check(author_id=auth.uid() and public.cookbook_is_member(cookbook_id) and public.cookbook_photo_attachable(image_id,cookbook_id));
create policy recipes_edit on public.cookbook_recipes for update to authenticated using(public.cookbook_is_member(cookbook_id)) with check(public.cookbook_is_member(cookbook_id) and public.cookbook_photo_attachable(image_id,cookbook_id));
create policy recipes_delete on public.cookbook_recipes for delete to authenticated using(public.cookbook_is_member(cookbook_id));
create policy follows_read on public.cookbook_follows for select to authenticated using(user_id=auth.uid());
create policy follows_create on public.cookbook_follows for insert to authenticated with check(user_id=auth.uid() and public.cookbook_can_read(cookbook_id));
create policy follows_delete on public.cookbook_follows for delete to authenticated using(user_id=auth.uid());
create policy reviews_read on public.recipe_reviews for select to authenticated using(public.cookbook_can_read_recipe(recipe_id));
create policy reviews_create on public.recipe_reviews for insert to authenticated with check(user_id=auth.uid() and public.cookbook_can_review(recipe_id));
create policy reviews_edit on public.recipe_reviews for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and public.cookbook_can_review(recipe_id));
create policy reviews_delete on public.recipe_reviews for delete to authenticated using(user_id=auth.uid());
create policy replies_read on public.review_replies for select to authenticated using(public.cookbook_can_read_review(review_id));
create policy replies_create on public.review_replies for insert to authenticated with check(user_id=auth.uid() and public.cookbook_can_reply(review_id));
create policy replies_delete on public.review_replies for delete to authenticated using(user_id=auth.uid());
create policy planner_read on public.cookbook_planners for select to authenticated using(public.cookbook_is_member(cookbook_id));
create policy planner_edit on public.cookbook_planners for update to authenticated using(public.cookbook_is_member(cookbook_id)) with check(public.cookbook_is_member(cookbook_id));

-- Views use the caller's RLS (Postgres 15+). Cookbook stars are AVG of every
-- visible recipe review in the book: SUM(ratings) / COUNT(reviews), never an
-- average of per-recipe averages. Unreviewed books return null and zero.
create view public.cookbook_stats with (security_invoker=true) as
  select b.*, (select count(*) from public.cookbook_recipes r where r.cookbook_id=b.id) as recipe_count,
    (select avg(v.rating)::numeric(3,2) from public.recipe_reviews v join public.cookbook_recipes r on r.id=v.recipe_id where r.cookbook_id=b.id) as rating,
    (select count(*) from public.recipe_reviews v join public.cookbook_recipes r on r.id=v.recipe_id where r.cookbook_id=b.id) as review_count
  from public.cookbooks b;
create view public.recipe_stats with (security_invoker=true) as
  select r.*, (select avg(v.rating)::numeric(3,2) from public.recipe_reviews v where v.recipe_id=r.id) as rating,
    (select count(*) from public.recipe_reviews v where v.recipe_id=r.id) as review_count
  from public.cookbook_recipes r;

create function public.cookbook_search(search_text text default '', meal_category text default '', protein text default '', recipe_tag text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.profiles where search_text='' or strpos(lower(username),lower(search_text))>0 or strpos(lower(display_name),lower(search_text))>0 order by username limit 50) p),'[]'::jsonb),
    'cookbooks',coalesce((select jsonb_agg(to_jsonb(b)) from (select * from public.cookbook_stats where search_text='' or strpos(lower(name),lower(search_text))>0 or strpos(lower(description),lower(search_text))>0 order by created_at desc limit 100) b),'[]'::jsonb),
    'recipes',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from public.recipe_stats where (meal_category='' or category=meal_category) and (protein='' or meat_type=protein) and (recipe_tag='' or recipe_tag=any(tags)) and (search_text='' or strpos(lower(title),lower(search_text))>0 or strpos(lower(description),lower(search_text))>0 or strpos(lower(category),lower(search_text))>0 or strpos(lower(meat_type),lower(search_text))>0 or exists(select 1 from unnest(tags) t where strpos(lower(t),lower(search_text))>0) or exists(select 1 from jsonb_array_elements(ingredients) i where strpos(lower(i->>'name'),lower(search_text))>0)) order by created_at desc limit 200) r),'[]'::jsonb)
  );
$$;

revoke all on public.social_photos,public.profiles,public.cookbooks,public.cookbook_members,public.friendships,public.cookbook_recipes,public.cookbook_follows,public.recipe_reviews,public.review_replies,public.cookbook_planners,public.cookbook_stats,public.recipe_stats from anon,authenticated;
grant select on public.social_photos,public.profiles,public.cookbooks,public.cookbook_members,public.friendships,public.cookbook_recipes,public.cookbook_follows,public.recipe_reviews,public.review_replies,public.cookbook_planners,public.cookbook_stats,public.recipe_stats to authenticated;
grant update(username,display_name,bio) on public.profiles to authenticated;
grant insert,delete on public.social_photos,public.cookbooks,public.friendships,public.cookbook_recipes,public.cookbook_follows,public.recipe_reviews,public.review_replies to authenticated;
grant delete on public.cookbook_members to authenticated;
grant update(name,description,visibility,cover_image_id,cover_color) on public.cookbooks to authenticated;
grant update(title,description,category,meat_type,diet,tags,servings,minutes,ingredients,instructions,image_id,source_url,source_calories,color) on public.cookbook_recipes to authenticated;
grant update(rating,comment) on public.recipe_reviews to authenticated;
-- Planner writes go through the version-checking RPC only; no direct table update grant.

-- PostgreSQL grants new functions to PUBLIC by default; explicitly close that
-- default for every function in this application before allowing signed-in use.
revoke all on function public.cookbook_new_user(),public.cookbook_created(),public.cookbook_touch_updated(),public.cookbook_is_member(uuid),public.cookbook_is_owner(uuid),public.cookbook_can_read(uuid),public.cookbook_can_read_recipe(uuid),public.cookbook_can_review(uuid),public.cookbook_can_read_review(uuid),public.cookbook_can_reply(uuid),public.cookbook_photo_owned(uuid),public.cookbook_photo_attachable(uuid,uuid),public.cookbook_photo_readable(uuid),public.cookbook_photo_unattached(uuid),public.cookbook_storage_readable(text),public.cookbook_storage_owned(text),public.cookbook_storage_unattached(text),public.cookbook_invite_partner(uuid,text),public.cookbook_accept_invitation(uuid),public.cookbook_accept_friendship(uuid),public.cookbook_my_memberships(),public.cookbook_get_planner(uuid),public.cookbook_save_planner(uuid,jsonb,integer),public.cookbook_search(text,text,text,text) from public,anon;
grant execute on function public.cookbook_is_member(uuid),public.cookbook_is_owner(uuid),public.cookbook_can_read(uuid),public.cookbook_can_read_recipe(uuid),public.cookbook_can_review(uuid),public.cookbook_can_read_review(uuid),public.cookbook_can_reply(uuid),public.cookbook_photo_owned(uuid),public.cookbook_photo_attachable(uuid,uuid),public.cookbook_photo_readable(uuid),public.cookbook_photo_unattached(uuid),public.cookbook_storage_readable(text),public.cookbook_storage_owned(text),public.cookbook_storage_unattached(text),public.cookbook_invite_partner(uuid,text),public.cookbook_accept_invitation(uuid),public.cookbook_accept_friendship(uuid),public.cookbook_my_memberships(),public.cookbook_get_planner(uuid),public.cookbook_save_planner(uuid,jsonb,integer),public.cookbook_search(text,text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('social-recipe-photos','social-recipe-photos',false,1500000,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy cookbook_photo_insert on storage.objects for insert to authenticated
  with check(bucket_id='social-recipe-photos' and public.cookbook_storage_owned(name));
create policy cookbook_photo_select on storage.objects for select to authenticated
  using(bucket_id='social-recipe-photos' and (public.cookbook_storage_owned(name) or public.cookbook_storage_readable(name)));
create policy cookbook_photo_delete on storage.objects for delete to authenticated
  using(bucket_id='social-recipe-photos' and public.cookbook_storage_owned(name) and public.cookbook_storage_unattached(name));
