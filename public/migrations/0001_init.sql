-- Family Trip Planner — initial schema
-- Multi-user trips: any row linked to trip_id is accessible to users in trip_members.
-- Run in Supabase SQL editor, or via supabase CLI.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Trips & membership
-- ============================================================================

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  destination   text not null,
  start_date    date not null,
  end_date      date not null,
  cover_emoji   text not null default '🧳',
  total_budget  numeric(12,2) not null default 0,
  currency      text not null default 'EUR',
  coords        jsonb,
  created_by    uuid not null references auth.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create type trip_role as enum ('owner', 'member');

create table public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      trip_role not null default 'member',
  added_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members(user_id);

-- Helper: is the current user a member of a given trip?
create or replace function public.is_trip_member(_trip_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = auth.uid()
  );
$$;

-- Creator is automatically owner.
create or replace function public.handle_trip_insert()
returns trigger language plpgsql security definer as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger trips_add_owner
  after insert on public.trips
  for each row execute function public.handle_trip_insert();

-- ============================================================================
-- Trip children tables
-- ============================================================================

create table public.days (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references public.trips(id) on delete cascade,
  date     date not null,
  label    text,
  unique (trip_id, date)
);

create type event_category as enum ('activity', 'meal', 'transport', 'rest', 'tour');

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips(id) on delete cascade,
  day_id       uuid not null references public.days(id) on delete cascade,
  start_time   text not null,
  end_time     text,
  title        text not null,
  description  text,
  location     text,
  category     event_category not null default 'activity',
  cost         numeric(12,2)
);
create index events_trip_idx on public.events(trip_id);
create index events_day_idx  on public.events(day_id);

create type budget_category as enum ('flights','accommodation','food','activities','transport','shopping','other');

create table public.budget_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  category   budget_category not null,
  label      text not null,
  planned    numeric(12,2) not null default 0,
  actual     numeric(12,2),
  date       date,
  paid_by    uuid,
  notes      text
);
create index budget_items_trip_idx on public.budget_items(trip_id);

create type cabin_class as enum ('economy','business','first');
create type flight_direction as enum ('outbound','return');

create table public.flights (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips(id) on delete cascade,
  airline              text not null,
  flight_number        text not null,
  departure_airport    text not null,
  arrival_airport      text not null,
  departure_time       timestamptz not null,
  arrival_time         timestamptz not null,
  cost                 numeric(12,2) not null default 0,
  currency             text not null default 'EUR',
  direction            flight_direction not null,
  cabin_class          cabin_class not null default 'economy',
  confirmation_number  text,
  baggage_included     boolean
);
create index flights_trip_idx on public.flights(trip_id);

create type accommodation_type as enum ('hotel','airbnb','hostel','villa','other');

create table public.accommodations (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips(id) on delete cascade,
  name                 text not null,
  type                 accommodation_type not null,
  address              text,
  check_in             date not null,
  check_out            date not null,
  cost                 numeric(12,2) not null default 0,
  currency             text not null default 'EUR',
  confirmation_number  text,
  notes                text,
  rating               numeric(2,1)
);
create index accommodations_trip_idx on public.accommodations(trip_id);

create type car_category as enum ('economy','compact','midsize','full-size','suv','van','luxury');

create table public.car_rentals (
  id                   uuid primary key default gen_random_uuid(),
  trip_id              uuid not null references public.trips(id) on delete cascade,
  company              text not null,
  car_model            text,
  car_category         car_category not null,
  pickup_location      text not null,
  dropoff_location     text,
  pickup_date          timestamptz not null,
  dropoff_date         timestamptz not null,
  cost                 numeric(12,2) not null default 0,
  currency             text not null default 'EUR',
  confirmation_number  text,
  driver_name          text,
  includes_insurance   boolean,
  notes                text
);
create index car_rentals_trip_idx on public.car_rentals(trip_id);

create table public.family_members (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references public.trips(id) on delete cascade,
  name      text not null,
  emoji     text not null default '🙂',
  is_child  boolean not null default false
);
create index family_members_trip_idx on public.family_members(trip_id);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  title         text not null,
  description   text,
  due_date      date,
  assigned_to   uuid,
  done          boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tasks_trip_idx on public.tasks(trip_id);

create type packing_category as enum ('clothing','toiletries','documents','electronics','other');

create table public.packing_items (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null references public.trips(id) on delete cascade,
  title     text not null,
  category  packing_category not null default 'other',
  packed    boolean not null default false,
  quantity  integer,
  notes     text
);
create index packing_items_trip_idx on public.packing_items(trip_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trips_touch      before update on public.trips      for each row execute function public.touch_updated_at();
create trigger tasks_touch      before update on public.tasks      for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.trips           enable row level security;
alter table public.trip_members    enable row level security;
alter table public.days            enable row level security;
alter table public.events          enable row level security;
alter table public.budget_items    enable row level security;
alter table public.flights         enable row level security;
alter table public.accommodations  enable row level security;
alter table public.car_rentals     enable row level security;
alter table public.family_members  enable row level security;
alter table public.tasks           enable row level security;
alter table public.packing_items   enable row level security;

-- trips: members can read; owner can update/delete; any authed user can insert (must set created_by = auth.uid()).
create policy trips_select on public.trips
  for select using (public.is_trip_member(id));

create policy trips_insert on public.trips
  for insert with check (created_by = auth.uid());

create policy trips_update on public.trips
  for update using (
    exists (select 1 from public.trip_members
            where trip_id = trips.id and user_id = auth.uid() and role = 'owner')
  );

create policy trips_delete on public.trips
  for delete using (
    exists (select 1 from public.trip_members
            where trip_id = trips.id and user_id = auth.uid() and role = 'owner')
  );

-- trip_members: members can read the membership rows of their trips; owner manages.
create policy trip_members_select on public.trip_members
  for select using (public.is_trip_member(trip_id));

create policy trip_members_owner_manage on public.trip_members
  for all using (
    exists (select 1 from public.trip_members m
            where m.trip_id = trip_members.trip_id and m.user_id = auth.uid() and m.role = 'owner')
  ) with check (
    exists (select 1 from public.trip_members m
            where m.trip_id = trip_members.trip_id and m.user_id = auth.uid() and m.role = 'owner')
  );

-- Child tables: any trip member can read/write.
do $$
declare t text;
begin
  foreach t in array array[
    'days','events','budget_items','flights','accommodations',
    'car_rentals','family_members','tasks','packing_items'
  ] loop
    execute format('create policy %I_all on public.%I for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));', t, t);
  end loop;
end $$;

-- ============================================================================
-- Realtime
-- ============================================================================

alter publication supabase_realtime add table
  public.trips, public.trip_members, public.days, public.events,
  public.budget_items, public.flights, public.accommodations,
  public.car_rentals, public.family_members, public.tasks, public.packing_items;
