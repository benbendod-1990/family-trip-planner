-- Single RPC that upserts a whole trip + all its children in one transaction.
-- Runs as security definer with row_security off, so it sidesteps the
-- per-table RLS dance. Authorization is enforced inside: caller must own the
-- trip (or be its creator on first insert).

create or replace function public.save_trip(_payload jsonb)
returns uuid language plpgsql security definer
set row_security = off as $$
declare
  _uid uuid := auth.uid();
  _trip_id uuid := (_payload->>'id')::uuid;
  _existing_owner uuid;
begin
  if _uid is null then
    raise exception 'unauthenticated: no auth.uid() in JWT (sign out and back in)';
  end if;

  -- If trip exists, only the owner can update it.
  select user_id into _existing_owner
  from public.trip_members
  where trip_id = _trip_id and role = 'owner'
  limit 1;
  if _existing_owner is not null and _existing_owner <> _uid then
    raise exception 'forbidden: not the trip owner';
  end if;

  -- Upsert the trip
  insert into public.trips (id, name, destination, start_date, end_date, cover_emoji, total_budget, currency, coords, created_by)
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
    _uid
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
    updated_at   = now();

  -- Children: nuke + replace per trip. Simpler than partial diff and fine
  -- for a single-trip-per-call pattern.
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
