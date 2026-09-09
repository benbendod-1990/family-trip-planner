// The snake_case JSONB payload that the save_trip(jsonb) RPC expects.
//
// Kept free of runtime imports on purpose: the app pulls it in through
// tripRepo, and scripts/push-trips.ts imports it straight from Node. One
// definition, so the two can't drift the way a copied mapping would.

import type { TripPlan } from '@/types/trip-plan'

const snake = (s: string) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)

function keys(obj: object, toKey: (k: string) => string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[toKey(k)] = v
  return out
}

export const toDb = (o: object) => keys(o, snake)
export const fromDb = (o: object) =>
  keys(o, (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))

/**
 * Fields save_trip() casts to a date, number, uuid or boolean.
 *
 * An empty string is not valid input for any of them, and the cast runs BEFORE
 * the coalesce that was meant to supply the default — `coalesce(''::numeric,0)`
 * throws rather than yielding 0. So a single blank left behind by an unfilled
 * form field aborts the whole trip push with "invalid input syntax for type
 * …", and the toast says only that the sync failed.
 *
 * Text columns are deliberately absent: '' is valid text, and several of them
 * are NOT NULL (flight_number is blank on Crete's return leg), so nulling them
 * would trade one failure for another.
 */
const CAST_FIELDS: Record<string, readonly string[]> = {
  days: ['date'],
  events: ['cost'],
  family_members: ['is_child'],
  tasks: ['due_date', 'assigned_to', 'completed_at', 'created_at', 'updated_at'],
  accommodations: ['check_in', 'check_out', 'cost', 'rating'],
  flights: ['departure_time', 'arrival_time', 'cost', 'baggage_included'],
  car_rentals: ['pickup_date', 'dropoff_date', 'cost', 'includes_insurance'],
  budget_items: ['planned', 'actual', 'date', 'paid_by'],
  packing_items: ['quantity'],
}

/** Blank out the cast-sensitive fields so save_trip()'s defaults can apply. */
function clean(row: Record<string, unknown>, table: string): Record<string, unknown> {
  const out = { ...row }
  for (const field of CAST_FIELDS[table] ?? []) {
    if (out[field] === '' || out[field] === undefined) out[field] = null
  }
  return out
}

/**
 * A half-known booking must not take the whole trip down with it.
 *
 * `flights.departure_time` is NOT NULL and save_trip() casts it with
 * `::timestamptz`, so one flight with a blank time — Crete's return leg, which
 * has an airline and a route but no date until the voucher is read — aborts the
 * entire push with a Postgres cast error. The trip then silently never syncs,
 * and the message the user sees says nothing about which flight.
 *
 * Substituting midnight on the trip's own boundary date keeps the row, and
 * lands on exactly the shape isPlaceholderFlight() already looks for, so the
 * AI rescan picks it up and fills in the real time from Gmail.
 */
function flightTimes(f: TripPlan['flights'][number], plan: TripPlan) {
  const fallback = `${f.direction === 'return' ? plan.endDate : plan.startDate}T00:00:00`
  return {
    departure_time: f.departureTime || fallback,
    arrival_time: f.arrivalTime || f.departureTime || fallback,
  }
}

export function tripToPayload(plan: TripPlan): Record<string, unknown> {
  // A day with no date can't be inserted (days.date is NOT NULL) and its events
  // would dangle off a row that never lands, so drop the pair together.
  const days = plan.days.filter(d => d.date)
  const events = days.flatMap(d =>
    d.events.map(e => clean({ ...toDb({ ...e }), day_id: d.id }, 'events'))
  )
  return {
    id: plan.id,
    name: plan.name,
    destination: plan.destination,
    start_date: plan.startDate,
    end_date: plan.endDate,
    cover_emoji: plan.coverEmoji,
    total_budget: plan.budget?.totalBudget ?? 0,
    currency: plan.budget?.currency ?? 'EUR',
    coords: plan.coords ?? null,
    doc_url: plan.docUrl || null,
    doc_title: plan.docTitle || null,
    days: days.map(d => ({ id: d.id, date: d.date, label: d.label ?? null })),
    events,
    family_members: plan.family.map(f => clean(toDb(f), 'family_members')),
    tasks: plan.tasks.map(t => clean(toDb(t), 'tasks')),
    // check_in/check_out are NOT NULL with no coalesce behind them, so a
    // half-entered hotel needs a real date, not a null.
    accommodations: plan.accommodations.map(a => ({
      ...clean(toDb(a), 'accommodations'),
      check_in: a.checkIn || plan.startDate,
      check_out: a.checkOut || plan.endDate,
    })),
    flights: plan.flights.map(f => ({ ...clean(toDb(f), 'flights'), ...flightTimes(f, plan) })),
    car_rentals: (plan.carRentals ?? []).map(c => ({
      ...clean(toDb(c), 'car_rentals'),
      pickup_date: c.pickupDate || plan.startDate,
      dropoff_date: c.dropoffDate || plan.endDate,
    })),
    budget_items: plan.budget.items.map(b => clean(toDb(b), 'budget_items')),
    packing_items: (plan.packingItems ?? []).map(p => clean(toDb(p), 'packing_items')),
    // documents are deliberately absent — save_trip() nukes-and-replaces its
    // children, and they live in their own table. See migration 0007.
  }
}
