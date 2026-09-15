-- Fix 42702 "column reference \"trip_id\" is ambiguous" on
-- claim_trip_share_link.
--
-- RETURNS TABLE (trip_id uuid, already_member boolean) exposes trip_id as a
-- PL/pgSQL OUT variable. Unqualified `ON CONFLICT (trip_id, user_id)` then
-- clashes with trip_members.trip_id (Peek worked; claim after Google login
-- failed). Name the primary key instead of listing those columns.
--
-- Live production already has this body (migration
-- fix_claim_share_link_trip_id_ambiguous). This file is the repo copy so a
-- fresh SQL Editor paste matches production, and so environments that ran
-- 0012/0013 pick up the claim fix without rewriting those files.
--
-- Idempotent: CREATE OR REPLACE + grants. Safe to paste more than once.
-- Merging this file does NOT apply it to production.

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
  on conflict on constraint trip_members_pkey do update
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
