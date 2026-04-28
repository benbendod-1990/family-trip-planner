-- Owner invites another user (by email) to a trip.
-- The invitee must have signed in at least once (so they exist in auth.users).
-- security definer because trip_members RLS would otherwise block the insert
-- when the invitee's user_id is not the caller. Authorization is enforced
-- inside the function: only the trip's owner may invite.

create or replace function public.invite_user_to_trip(_trip_id uuid, _email text)
returns table (added_user_id uuid, role trip_role) language plpgsql security definer as $$
declare
  _user_id uuid;
begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may invite members';
  end if;

  select id into _user_id from auth.users where lower(email) = lower(_email);
  if _user_id is null then
    raise exception 'user_not_found: % must sign in to the app at least once before being invited', _email;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (_trip_id, _user_id, 'member')
  on conflict (trip_id, user_id) do nothing;

  return query
    select tm.user_id, tm.role
    from public.trip_members tm
    where tm.trip_id = _trip_id and tm.user_id = _user_id;
end;
$$;

grant execute on function public.invite_user_to_trip(uuid, text) to authenticated;

-- Owner removes a member.
create or replace function public.remove_user_from_trip(_trip_id uuid, _target_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may remove members';
  end if;
  if _target_user_id = auth.uid() then
    raise exception 'cannot_remove_self: an owner cannot remove themselves';
  end if;
  delete from public.trip_members
  where trip_id = _trip_id and user_id = _target_user_id and role = 'member';
end;
$$;

grant execute on function public.remove_user_from_trip(uuid, uuid) to authenticated;

-- List members of a trip with their email (for owner UI).
create or replace function public.list_trip_members(_trip_id uuid)
returns table (user_id uuid, email text, role trip_role, added_at timestamptz)
language sql security definer as $$
  select tm.user_id, u.email::text, tm.role, tm.added_at
  from public.trip_members tm
  join auth.users u on u.id = tm.user_id
  where tm.trip_id = _trip_id
    and exists (
      select 1 from public.trip_members me
      where me.trip_id = _trip_id and me.user_id = auth.uid()
    )
  order by tm.added_at;
$$;

grant execute on function public.list_trip_members(uuid) to authenticated;
