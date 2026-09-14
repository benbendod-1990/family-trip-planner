-- Fix 42702 "column reference \"expires_at\" is ambiguous" on
-- create_or_get_trip_share_link (and the same RETURNS TABLE clash on the
-- other trip_share_* RPCs).
--
-- PL/pgSQL RETURNS TABLE (token, expires_at, created_at) exposes those names
-- as OUT variables in the function body. Unqualified `expires_at` in
-- UPDATE/SELECT then clashes with trip_share_links.expires_at.
--
-- Live production was hotfixed the same way (qualify sl.expires_at). This
-- file is the repo copy so a fresh SQL Editor paste matches production, and
-- so environments that already ran the original 0012 pick up the fix.
--
-- Idempotent: CREATE OR REPLACE only. Safe to paste more than once.
-- Merging this file does NOT apply it to production. Run it in Supabase
-- only if the live function is still the unqualified 0012 body.

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
