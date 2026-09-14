-- Pending email invites: the owner can invite an address that has never
-- signed in. The row waits in trip_invites until that Google account
-- appears in auth.users, then a trigger (and a login RPC safety net)
-- inserts trip_members with role=member for those trips only.
--
-- Replaces the 0002/0009 user_not_found hard-fail that required an
-- existing auth.users row before invite_user_to_trip would succeed.
--
-- Idempotent: safe to paste more than once in the SQL Editor.
-- Merging this file does NOT apply it to production. Run it in Supabase.

create table if not exists public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references auth.users(id) on delete cascade,
  role        trip_role not null default 'member',
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  constraint trip_invites_email_normalized check (email = lower(email)),
  constraint trip_invites_email_length check (char_length(email) between 3 and 320)
);

create unique index if not exists trip_invites_pending_unique
  on public.trip_invites (trip_id, email)
  where claimed_at is null;

create index if not exists trip_invites_email_pending_idx
  on public.trip_invites (email)
  where claimed_at is null;

alter table public.trip_invites enable row level security;

drop policy if exists trip_invites_select on public.trip_invites;
drop policy if exists trip_invites_owner_insert on public.trip_invites;
drop policy if exists trip_invites_owner_update on public.trip_invites;
drop policy if exists trip_invites_owner_delete on public.trip_invites;

create policy trip_invites_select on public.trip_invites
  for select using (public.is_trip_member(trip_id));

create policy trip_invites_owner_insert on public.trip_invites
  for insert with check (public.is_trip_owner(trip_id));

create policy trip_invites_owner_update on public.trip_invites
  for update using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy trip_invites_owner_delete on public.trip_invites
  for delete using (public.is_trip_owner(trip_id));

grant select, insert, update, delete on public.trip_invites to authenticated;

-- Shared claim helper: attach every unclaimed invite for this email as
-- role=member. Never upgrades an existing owner row (ON CONFLICT skip).
create or replace function public.claim_trip_invites_for_email(_user_id uuid, _email text)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _normalized text;
  _n integer := 0;
begin
  _normalized := lower(trim(coalesce(_email, '')));
  if _user_id is null or _normalized = '' then
    return 0;
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  select ti.trip_id, _user_id, 'member'::trip_role
  from public.trip_invites ti
  where ti.email = _normalized
    and ti.claimed_at is null
  on conflict (trip_id, user_id) do nothing;

  update public.trip_invites
  set claimed_at = now()
  where email = _normalized
    and claimed_at is null;

  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke all on function public.claim_trip_invites_for_email(uuid, text) from public, anon, authenticated;

create or replace function public.claim_pending_invites()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _uid uuid := auth.uid();
  _email text;
begin
  if _uid is null then
    raise exception 'unauthenticated: sign in to claim invites';
  end if;

  select lower(u.email) into _email
  from auth.users u
  where u.id = _uid;

  if _email is null then
    _email := lower(nullif(auth.jwt() ->> 'email', ''));
  end if;

  return public.claim_trip_invites_for_email(_uid, _email);
end;
$$;

grant execute on function public.claim_pending_invites() to authenticated;

create or replace function public.handle_auth_user_trip_invites()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.claim_trip_invites_for_email(
    new.id,
    coalesce(new.email, new.raw_user_meta_data->>'email')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_claim_trip_invites on auth.users;
create trigger on_auth_user_claim_trip_invites
  after insert or update of email on auth.users
  for each row
  execute function public.handle_auth_user_trip_invites();

revoke all on function public.handle_auth_user_trip_invites() from public, anon, authenticated;

-- Recreate invite: return type gains invite_status, so DROP is required.
drop function if exists public.invite_user_to_trip(uuid, text);

create or replace function public.invite_user_to_trip(_trip_id uuid, _email text)
returns table (added_user_id uuid, member_role trip_role, invite_status text)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _uid uuid := auth.uid();
  _normalized text;
  _user_id uuid;
begin
  _normalized := lower(trim(coalesce(_email, '')));

  if _normalized = '' or _normalized !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    raise exception 'invalid_email: %', coalesce(_email, '');
  end if;

  if not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = _trip_id
      and tm.user_id = _uid
      and tm.role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may invite members';
  end if;

  select u.id into _user_id
  from auth.users u
  where lower(u.email) = _normalized;

  if _user_id is not null then
    if exists (
      select 1
      from public.trip_members tm
      where tm.trip_id = _trip_id
        and tm.user_id = _user_id
    ) then
      raise exception 'already_member: % is already a member of this trip', _normalized;
    end if;

    insert into public.trip_members (trip_id, user_id, role)
    values (_trip_id, _user_id, 'member')
    on conflict (trip_id, user_id) do nothing;

    update public.trip_invites
    set claimed_at = now()
    where trip_id = _trip_id
      and email = _normalized
      and claimed_at is null;

    return query
      select tm.user_id, tm.role, 'added'::text
      from public.trip_members tm
      where tm.trip_id = _trip_id
        and tm.user_id = _user_id;
    return;
  end if;

  insert into public.trip_invites (trip_id, email, invited_by, role)
  values (_trip_id, _normalized, _uid, 'member')
  on conflict (trip_id, email) where claimed_at is null do nothing;

  return query
    select null::uuid, 'member'::trip_role, 'pending'::text;
end;
$$;

grant execute on function public.invite_user_to_trip(uuid, text) to authenticated;

create or replace function public.list_pending_trip_invites(_trip_id uuid)
returns table (email text, created_at timestamptz)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select ti.email, ti.created_at
  from public.trip_invites ti
  where ti.trip_id = _trip_id
    and ti.claimed_at is null
    and public.is_trip_member(_trip_id)
  order by ti.created_at;
$$;

grant execute on function public.list_pending_trip_invites(uuid) to authenticated;

create or replace function public.cancel_trip_invite(_trip_id uuid, _email text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = _trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'owner'
  ) then
    raise exception 'forbidden: only the trip owner may cancel invites';
  end if;

  delete from public.trip_invites ti
  where ti.trip_id = _trip_id
    and ti.email = lower(trim(_email))
    and ti.claimed_at is null;
end;
$$;

grant execute on function public.cancel_trip_invite(uuid, text) to authenticated;
