-- Token share links for a SINGLE trip (WhatsApp-friendly).
--
-- Unlike trip_invites (email-based), these are unguessable tokens scoped to
-- one trip_id. Claiming adds trip_members for that trip only — never the
-- family catalog. Family-catalog emails (benbendod / shechter.gal) stay
-- co-owners and are never demoted.
--
-- Default role is member. Default expiry is 30 days. Owners can reuse the
-- active link, revoke it, or regenerate a new token.
--
-- Idempotent. Merging this file does NOT apply it to production.
-- If this already ran with unqualified expires_at, apply 0013 (42702).

create table if not exists public.trip_share_links (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  token           text not null,
  created_by      uuid not null references auth.users(id) on delete cascade,
  role            trip_role not null default 'member',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '30 days'),
  revoked_at      timestamptz,
  last_claimed_at timestamptz,
  constraint trip_share_links_token_hex check (token ~ '^[0-9a-f]{64}$'),
  constraint trip_share_links_member_role check (role = 'member')
);

create unique index if not exists trip_share_links_token_uidx
  on public.trip_share_links (token);

-- At most one non-revoked link per trip. Expired rows are revoked before insert.
create unique index if not exists trip_share_links_one_active
  on public.trip_share_links (trip_id)
  where revoked_at is null;

alter table public.trip_share_links enable row level security;

drop policy if exists trip_share_links_owner_select on public.trip_share_links;
drop policy if exists trip_share_links_owner_insert on public.trip_share_links;
drop policy if exists trip_share_links_owner_update on public.trip_share_links;
drop policy if exists trip_share_links_owner_delete on public.trip_share_links;

create policy trip_share_links_owner_select on public.trip_share_links
  for select using (public.is_trip_owner(trip_id));

create policy trip_share_links_owner_insert on public.trip_share_links
  for insert with check (
    public.is_trip_owner(trip_id)
    and role = 'member'
    and created_by = auth.uid()
  );

create policy trip_share_links_owner_update on public.trip_share_links
  for update using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id) and role = 'member');

-- Revoke is an update of revoked_at. No client deletes.
create policy trip_share_links_owner_delete on public.trip_share_links
  for delete using (false);

revoke all on table public.trip_share_links from public, anon;
grant select, insert, update on public.trip_share_links to authenticated;

-- Same helper as 0011. Repeated so 0012 can be applied even if 0011 is still pending.
create or replace function public.is_family_catalog_email(_email text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(trim(coalesce(_email, ''))) in (
    'benbendod@gmail.com',
    'shechter.gal@gmail.com'
  );
$$;

create or replace function public._new_trip_share_token()
returns text
language sql
volatile
as $$
  -- 64 hex chars from two UUIDv4 values (no pgcrypto dependency).
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

revoke all on function public._new_trip_share_token() from public, anon, authenticated;

create or replace function public._require_trip_owner(_trip_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'unauthenticated: sign in to manage share links';
  end if;
  if not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = _trip_id
      and tm.user_id = _uid
      and tm.role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may manage share links';
  end if;
  return _uid;
end;
$$;

revoke all on function public._require_trip_owner(uuid) from public, anon, authenticated;

create or replace function public.get_trip_share_link(_trip_id uuid)
returns table (token text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public._require_trip_owner(_trip_id);

  return query
    select sl.token, sl.expires_at, sl.created_at
    from public.trip_share_links sl
    where sl.trip_id = _trip_id
      and sl.revoked_at is null
      and sl.expires_at > now()
    order by sl.created_at desc
    limit 1;
end;
$$;

grant execute on function public.get_trip_share_link(uuid) to authenticated;

-- RETURNS TABLE (token, expires_at, created_at) exposes those names as OUT
-- variables. Unqualified expires_at in UPDATE/WHERE is 42702 ambiguous
-- (PL/pgSQL variable vs table column). Always qualify as sl.expires_at.
create or replace function public.create_or_get_trip_share_link(_trip_id uuid)
returns table (token text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _uid uuid;
  _token text;
begin
  _uid := public._require_trip_owner(_trip_id);

  update public.trip_share_links sl
  set revoked_at = now()
  where sl.trip_id = _trip_id
    and sl.revoked_at is null
    and sl.expires_at <= now();

  return query
    select sl.token, sl.expires_at, sl.created_at
    from public.trip_share_links sl
    where sl.trip_id = _trip_id
      and sl.revoked_at is null
      and sl.expires_at > now()
    order by sl.created_at desc
    limit 1;
  if found then
    return;
  end if;

  _token := public._new_trip_share_token();

  begin
    insert into public.trip_share_links (trip_id, token, created_by, role)
    values (_trip_id, _token, _uid, 'member');
  exception
    when unique_violation then
      return query
        select sl.token, sl.expires_at, sl.created_at
        from public.trip_share_links sl
        where sl.trip_id = _trip_id
          and sl.revoked_at is null
          and sl.expires_at > now()
        order by sl.created_at desc
        limit 1;
      return;
  end;

  return query
    select sl.token, sl.expires_at, sl.created_at
    from public.trip_share_links sl
    where sl.token = _token;
end;
$$;

grant execute on function public.create_or_get_trip_share_link(uuid) to authenticated;

create or replace function public.revoke_trip_share_link(_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public._require_trip_owner(_trip_id);

  update public.trip_share_links sl
  set revoked_at = now()
  where sl.trip_id = _trip_id
    and sl.revoked_at is null;
end;
$$;

grant execute on function public.revoke_trip_share_link(uuid) to authenticated;

create or replace function public.regenerate_trip_share_link(_trip_id uuid)
returns table (token text, expires_at timestamptz, created_at timestamptz)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public._require_trip_owner(_trip_id);
  perform public.revoke_trip_share_link(_trip_id);
  return query
    select * from public.create_or_get_trip_share_link(_trip_id);
end;
$$;

grant execute on function public.regenerate_trip_share_link(uuid) to authenticated;

-- Public peek: token is the secret. Returns that trip's label only.
create or replace function public.peek_trip_share_link(_token text)
returns table (
  trip_id uuid,
  trip_name text,
  destination text,
  cover_emoji text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if _token is null or _token !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
    select t.id, t.name, t.destination, t.cover_emoji, sl.expires_at
    from public.trip_share_links sl
    join public.trips t on t.id = sl.trip_id
    where sl.token = _token
      and sl.revoked_at is null
      and sl.expires_at > now();
end;
$$;

revoke all on function public.peek_trip_share_link(text) from public;
grant execute on function public.peek_trip_share_link(text) to anon, authenticated;

create or replace function public.claim_trip_share_link(_token text)
returns table (trip_id uuid, already_member boolean)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _link public.trip_share_links%rowtype;
  _was_member boolean;
  _role trip_role;
begin
  if _uid is null then
    raise exception 'unauthenticated: sign in to claim a share link';
  end if;

  if _token is null or _token !~ '^[0-9a-f]{64}$' then
    raise exception 'share_link_invalid';
  end if;

  select sl.* into _link
  from public.trip_share_links sl
  where sl.token = _token;

  if not found then
    raise exception 'share_link_invalid';
  end if;

  if _link.revoked_at is not null then
    raise exception 'share_link_revoked';
  end if;

  if _link.expires_at <= now() then
    raise exception 'share_link_expired';
  end if;

  select lower(u.email) into _email
  from auth.users u
  where u.id = _uid;

  if _email is null then
    _email := lower(nullif(auth.jwt() ->> 'email', ''));
  end if;

  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = _link.trip_id
      and tm.user_id = _uid
  ) into _was_member;

  _role := case
    when public.is_family_catalog_email(_email) then 'owner'::trip_role
    else 'member'::trip_role
  end;

  insert into public.trip_members (trip_id, user_id, role)
  values (_link.trip_id, _uid, _role)
  on conflict (trip_id, user_id) do update
    set role = case
      when public.trip_members.role = 'owner' then 'owner'::trip_role
      when excluded.role = 'owner' then 'owner'::trip_role
      else public.trip_members.role
    end;

  update public.trip_share_links sl
  set last_claimed_at = now()
  where sl.token = _token;

  return query
    select _link.trip_id, _was_member;
end;
$$;

revoke all on function public.claim_trip_share_link(text) from public, anon;
grant execute on function public.claim_trip_share_link(text) to authenticated;
