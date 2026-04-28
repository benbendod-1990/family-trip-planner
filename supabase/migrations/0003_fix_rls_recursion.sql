-- Fix RLS infinite recursion on trip_members.
-- Original policies referenced trip_members from inside trip_members policies,
-- which Postgres evaluates with RLS again — infinite loop. Replace with
-- security-definer helpers that bypass RLS internally.

-- Helper: is the current user an owner of this trip?
-- `set row_security = off` is belt-and-braces: even if BYPASSRLS isn't on the
-- function owner, the function still runs without RLS.
create or replace function public.is_trip_owner(_trip_id uuid)
returns boolean language plpgsql security definer stable
set row_security = off as $$
begin
  return exists(
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = auth.uid() and role = 'owner'
  );
end;
$$;

-- Same hardening on the existing helper.
create or replace function public.is_trip_member(_trip_id uuid)
returns boolean language plpgsql security definer stable
set row_security = off as $$
begin
  return exists(
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = auth.uid()
  );
end;
$$;

-- And on the auto-add-owner trigger.
create or replace function public.handle_trip_insert()
returns trigger language plpgsql security definer
set row_security = off as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

-- Replace the recursive policies on trip_members.
drop policy if exists trip_members_select on public.trip_members;
drop policy if exists trip_members_owner_manage on public.trip_members;

-- A user can read membership rows for trips they're in.
create policy trip_members_select on public.trip_members
  for select using (
    user_id = auth.uid() or public.is_trip_owner(trip_id)
  );

-- Only the owner can insert / update / delete other rows.
create policy trip_members_owner_insert on public.trip_members
  for insert with check (public.is_trip_owner(trip_id));

create policy trip_members_owner_update on public.trip_members
  for update using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy trip_members_owner_delete on public.trip_members
  for delete using (public.is_trip_owner(trip_id));
