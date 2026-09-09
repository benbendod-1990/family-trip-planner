-- Fix 42702 "column reference \"role\" is ambiguous" on invite_user_to_trip.
--
-- PL/pgSQL RETURNS TABLE (..., role trip_role) exposes `role` as an OUT
-- column in the function body. Unqualified `role = 'owner'` then clashes
-- with trip_members.role.
--
-- This migration:
--   * drops and recreates invite_user_to_trip with OUT column `member_role`
--     (the client ignores the invite RPC payload; it only checks errors)
--   * qualifies trip_members columns in all three membership RPCs
--   * keeps the same owner checks and exception messages the UI parses
--     (forbidden / user_not_found / cannot_remove_self)
--
-- Idempotent: safe to paste more than once in the SQL Editor.
-- Merging this file does NOT apply it to production. Run it in Supabase.

-- Recreate invite: OUT column renamed, so DROP is required (CREATE OR REPLACE
-- cannot change a function's return type).
drop function if exists public.invite_user_to_trip(uuid, text);

create or replace function public.invite_user_to_trip(_trip_id uuid, _email text)
returns table (added_user_id uuid, member_role trip_role)
language plpgsql
security definer
as $$
declare
  _user_id uuid;
begin
  if not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = _trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may invite members';
  end if;

  select u.id into _user_id
  from auth.users u
  where lower(u.email) = lower(_email);
  if _user_id is null then
    raise exception 'user_not_found: % must sign in to the app at least once before being invited', _email;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (_trip_id, _user_id, 'member')
  on conflict (trip_id, user_id) do nothing;

  return query
    select tm.user_id, tm.role
    from public.trip_members tm
    where tm.trip_id = _trip_id
      and tm.user_id = _user_id;
end;
$$;

grant execute on function public.invite_user_to_trip(uuid, text) to authenticated;

-- Owner removes a member. RETURNS VOID so `role` is not an OUT column, but
-- qualify anyway so the same clash cannot appear later.
create or replace function public.remove_user_from_trip(_trip_id uuid, _target_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = _trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may remove members';
  end if;
  if _target_user_id = auth.uid() then
    raise exception 'cannot_remove_self: an owner cannot remove themselves';
  end if;
  delete from public.trip_members tm
  where tm.trip_id = _trip_id
    and tm.user_id = _target_user_id
    and tm.role = 'member';
end;
$$;

grant execute on function public.remove_user_from_trip(uuid, uuid) to authenticated;

-- LANGUAGE SQL already selected tm.role; keep OUT column `role` because the
-- client reads TripMember.role. Qualify every trip_members column.
create or replace function public.list_trip_members(_trip_id uuid)
returns table (user_id uuid, email text, role trip_role, added_at timestamptz)
language sql
security definer
as $$
  select tm.user_id, u.email::text, tm.role, tm.added_at
  from public.trip_members tm
  join auth.users u on u.id = tm.user_id
  where tm.trip_id = _trip_id
    and exists (
      select 1
      from public.trip_members me
      where me.trip_id = _trip_id
        and me.user_id = auth.uid()
    )
  order by tm.added_at;
$$;

grant execute on function public.list_trip_members(uuid) to authenticated;
