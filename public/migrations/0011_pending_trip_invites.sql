-- Pending email invites + family catalog co-owners.
--
-- Regular invitees: unregistered email waits in trip_invites, then claim
-- inserts trip_members with the invite role (UI invites are always member)
-- for those trips only. RLS listTrips stays membership-scoped.
--
-- Family catalog (benbendod@gmail.com, shechter.gal@gmail.com): co-owner
-- on EVERY cloud trip, including Rome. Gal is not in auth.users yet, so
-- this migration seeds pending owner invites for her on all current trips;
-- first Google login claims them as owner. There is no hourly upgrade job
-- in this project (pg_cron is not installed) — claim-as-owner is the path.
--
-- Replaces the 0002/0009 user_not_found hard-fail.
-- Idempotent. Merging this file does NOT apply it to production.

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

-- Client inserts are member-only. Owner/co-owner pending rows are written
-- by security-definer functions (family catalog seed / new-trip hook).
create policy trip_invites_owner_insert on public.trip_invites
  for insert with check (public.is_trip_owner(trip_id) and role = 'member');

create policy trip_invites_owner_update on public.trip_invites
  for update using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id) and role = 'member');

create policy trip_invites_owner_delete on public.trip_invites
  for delete using (public.is_trip_owner(trip_id));

grant select, insert, update, delete on public.trip_invites to authenticated;

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

-- Shared claim helper. Regular invitees get only the pending trips (invite
-- role, default member). Family-catalog emails become owner on every trip.
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
  select
    ti.trip_id,
    _user_id,
    case
      when public.is_family_catalog_email(_normalized) then 'owner'::trip_role
      else ti.role
    end
  from public.trip_invites ti
  where ti.email = _normalized
    and ti.claimed_at is null
  on conflict (trip_id, user_id) do update
    set role = case
      when excluded.role = 'owner' then 'owner'::trip_role
      else public.trip_members.role
    end;

  if public.is_family_catalog_email(_normalized) then
    insert into public.trip_members (trip_id, user_id, role)
    select t.id, _user_id, 'owner'::trip_role
    from public.trips t
    on conflict (trip_id, user_id) do update
      set role = 'owner'::trip_role;
  end if;

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
  _invite_role trip_role;
begin
  _normalized := lower(trim(coalesce(_email, '')));

  if _normalized = '' or _normalized !~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$' then
    raise exception 'invalid_email: %', coalesce(_email, '');
  end if;

  _invite_role := case
    when public.is_family_catalog_email(_normalized) then 'owner'::trip_role
    else 'member'::trip_role
  end;

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
    values (_trip_id, _user_id, _invite_role)
    on conflict (trip_id, user_id) do update
      set role = case
        when excluded.role = 'owner' then 'owner'::trip_role
        else public.trip_members.role
      end;

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
  values (_trip_id, _normalized, _uid, _invite_role)
  on conflict (trip_id, email) where claimed_at is null do update
    set role = case
      when excluded.role = 'owner' then 'owner'::trip_role
      else public.trip_invites.role
    end;

  return query
    select null::uuid, _invite_role, 'pending'::text;
end;
$$;

grant execute on function public.invite_user_to_trip(uuid, text) to authenticated;

drop function if exists public.list_pending_trip_invites(uuid);

create or replace function public.list_pending_trip_invites(_trip_id uuid)
returns table (email text, created_at timestamptz, member_role trip_role)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select ti.email, ti.created_at, ti.role
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

  if public.is_family_catalog_email(lower(trim(_email))) then
    raise exception 'forbidden: family catalog invites cannot be cancelled';
  end if;

  delete from public.trip_invites ti
  where ti.trip_id = _trip_id
    and ti.email = lower(trim(_email))
    and ti.claimed_at is null;
end;
$$;

grant execute on function public.cancel_trip_invite(uuid, text) to authenticated;

-- New trips: creator is owner, then family-catalog emails become co-owners
-- (or pending owner invites if they have not signed in yet).
create or replace function public.ensure_family_catalog_memberships(_trip_id uuid, _invited_by uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _email text;
  _uid uuid;
  _family text[] := array['benbendod@gmail.com', 'shechter.gal@gmail.com'];
begin
  foreach _email in array _family loop
    select u.id into _uid from auth.users u where lower(u.email) = _email;
    if _uid is not null then
      insert into public.trip_members (trip_id, user_id, role)
      values (_trip_id, _uid, 'owner')
      on conflict (trip_id, user_id) do update
        set role = 'owner';
    elsif _invited_by is not null then
      insert into public.trip_invites (trip_id, email, invited_by, role)
      values (_trip_id, _email, _invited_by, 'owner')
      on conflict (trip_id, email) where claimed_at is null do update
        set role = 'owner';
    end if;
  end loop;
end;
$$;

revoke all on function public.ensure_family_catalog_memberships(uuid, uuid) from public, anon, authenticated;

create or replace function public.handle_trip_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  perform public.ensure_family_catalog_memberships(new.id, new.created_by);
  return new;
end;
$$;

-- Any owner may save (Ben and Gal as co-owners). The previous LIMIT 1 check
-- rejected the second owner when it happened to pick the other uuid.
create or replace function public.save_trip(_payload jsonb)
returns uuid language plpgsql security definer
set row_security = off as $$
declare
  _uid uuid := auth.uid();
  _trip_id uuid := (_payload->>'id')::uuid;
  _has_owners boolean;
begin
  if _uid is null then
    raise exception 'unauthenticated: no auth.uid() in JWT (sign out and back in)';
  end if;

  select exists (
    select 1 from public.trip_members
    where trip_id = _trip_id and role = 'owner'
  ) into _has_owners;
  if _has_owners and not exists (
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = _uid and role = 'owner'
  ) then
    raise exception 'forbidden: not the trip owner';
  end if;

  insert into public.trips (id, name, destination, start_date, end_date, cover_emoji, total_budget, currency, coords, created_by, doc_url, doc_title)
  values (
    _trip_id,
    _payload->>'name',
    _payload->>'destination',
    (_payload->>'start_date')::date,
    (_payload->>'end_date')::date,
    coalesce(_payload->>'cover_emoji', '🧳'),
    coalesce((_payload->>'total_budget')::numeric, 0),
    coalesce(_payload->>'currency', 'EUR'),
    case when _payload->'coords' is null or _payload->'coords' = 'null'::jsonb then null else _payload->'coords' end,
    _uid,
    nullif(_payload->>'doc_url', ''),
    nullif(_payload->>'doc_title', '')
  )
  on conflict (id) do update set
    name         = excluded.name,
    destination  = excluded.destination,
    start_date   = excluded.start_date,
    end_date     = excluded.end_date,
    cover_emoji  = excluded.cover_emoji,
    total_budget = excluded.total_budget,
    currency     = excluded.currency,
    coords       = excluded.coords,
    doc_url      = coalesce(nullif(excluded.doc_url, ''), public.trips.doc_url),
    doc_title    = coalesce(nullif(excluded.doc_title, ''), public.trips.doc_title),
    updated_at   = now();

  delete from public.events           where trip_id = _trip_id;
  delete from public.days             where trip_id = _trip_id;
  delete from public.budget_items     where trip_id = _trip_id;
  delete from public.flights          where trip_id = _trip_id;
  delete from public.accommodations   where trip_id = _trip_id;
  delete from public.car_rentals      where trip_id = _trip_id;
  delete from public.family_members   where trip_id = _trip_id;
  delete from public.tasks            where trip_id = _trip_id;
  delete from public.packing_items    where trip_id = _trip_id;

  insert into public.days (id, trip_id, date, label)
  select (d->>'id')::uuid, _trip_id, (d->>'date')::date, d->>'label'
  from jsonb_array_elements(coalesce(_payload->'days', '[]'::jsonb)) d;

  insert into public.events (id, trip_id, day_id, start_time, end_time, title, description, location, category, cost)
  select (e->>'id')::uuid, _trip_id, (e->>'day_id')::uuid, e->>'start_time', e->>'end_time',
         e->>'title', e->>'description', e->>'location',
         coalesce((e->>'category')::event_category, 'activity'),
         (e->>'cost')::numeric
  from jsonb_array_elements(coalesce(_payload->'events', '[]'::jsonb)) e;

  insert into public.family_members (id, trip_id, name, emoji, is_child)
  select (f->>'id')::uuid, _trip_id, f->>'name', coalesce(f->>'emoji', '🙂'), coalesce((f->>'is_child')::boolean, false)
  from jsonb_array_elements(coalesce(_payload->'family_members', '[]'::jsonb)) f;

  insert into public.tasks (id, trip_id, title, description, due_date, assigned_to, done, completed_at, created_at, updated_at)
  select (t->>'id')::uuid, _trip_id, t->>'title', t->>'description',
         (t->>'due_date')::date,
         nullif(t->>'assigned_to','')::uuid,
         coalesce((t->>'done')::boolean, false),
         (t->>'completed_at')::timestamptz,
         coalesce((t->>'created_at')::timestamptz, now()),
         coalesce((t->>'updated_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(_payload->'tasks', '[]'::jsonb)) t;

  insert into public.accommodations (id, trip_id, name, type, address, check_in, check_out, cost, currency, confirmation_number, notes, rating)
  select (a->>'id')::uuid, _trip_id, a->>'name',
         coalesce((a->>'type')::accommodation_type, 'hotel'),
         a->>'address', (a->>'check_in')::date, (a->>'check_out')::date,
         coalesce((a->>'cost')::numeric, 0),
         coalesce(a->>'currency', 'EUR'),
         a->>'confirmation_number', a->>'notes', (a->>'rating')::numeric
  from jsonb_array_elements(coalesce(_payload->'accommodations', '[]'::jsonb)) a;

  insert into public.flights (id, trip_id, airline, flight_number, departure_airport, arrival_airport, departure_time, arrival_time, cost, currency, direction, cabin_class, confirmation_number, baggage_included)
  select (f->>'id')::uuid, _trip_id, f->>'airline', f->>'flight_number',
         f->>'departure_airport', f->>'arrival_airport',
         (f->>'departure_time')::timestamptz, (f->>'arrival_time')::timestamptz,
         coalesce((f->>'cost')::numeric, 0),
         coalesce(f->>'currency', 'EUR'),
         (f->>'direction')::flight_direction,
         coalesce((f->>'cabin_class')::cabin_class, 'economy'),
         f->>'confirmation_number',
         (f->>'baggage_included')::boolean
  from jsonb_array_elements(coalesce(_payload->'flights', '[]'::jsonb)) f;

  insert into public.car_rentals (id, trip_id, company, car_model, car_category, pickup_location, dropoff_location, pickup_date, dropoff_date, cost, currency, confirmation_number, driver_name, includes_insurance, notes)
  select (c->>'id')::uuid, _trip_id, c->>'company', c->>'car_model',
         (c->>'car_category')::car_category,
         c->>'pickup_location', c->>'dropoff_location',
         (c->>'pickup_date')::timestamptz, (c->>'dropoff_date')::timestamptz,
         coalesce((c->>'cost')::numeric, 0),
         coalesce(c->>'currency', 'EUR'),
         c->>'confirmation_number', c->>'driver_name',
         (c->>'includes_insurance')::boolean,
         c->>'notes'
  from jsonb_array_elements(coalesce(_payload->'car_rentals', '[]'::jsonb)) c;

  insert into public.budget_items (id, trip_id, category, label, planned, actual, date, paid_by, notes)
  select (b->>'id')::uuid, _trip_id,
         (b->>'category')::budget_category,
         b->>'label',
         coalesce((b->>'planned')::numeric, 0),
         (b->>'actual')::numeric,
         (b->>'date')::date,
         nullif(b->>'paid_by','')::uuid,
         b->>'notes'
  from jsonb_array_elements(coalesce(_payload->'budget_items', '[]'::jsonb)) b;

  insert into public.packing_items (id, trip_id, title, category, packed, quantity, notes)
  select (p->>'id')::uuid, _trip_id, p->>'title',
         coalesce((p->>'category')::packing_category, 'other'),
         coalesce((p->>'packed')::boolean, false),
         (p->>'quantity')::integer,
         p->>'notes'
  from jsonb_array_elements(coalesce(_payload->'packing_items', '[]'::jsonb)) p;

  return _trip_id;
end;
$$;

grant execute on function public.save_trip(jsonb) to authenticated;

-- One-shot: Gal is not in auth.users. Pending co-owner on every existing trip,
-- including Rome (30a5d517-0db3-427f-adfa-92ef125e1f8f).
insert into public.trip_invites (trip_id, email, invited_by, role)
select t.id, 'shechter.gal@gmail.com', t.created_by, 'owner'::trip_role
from public.trips t
where t.created_by is not null
on conflict (trip_id, email) where claimed_at is null do update
  set role = 'owner'::trip_role;

