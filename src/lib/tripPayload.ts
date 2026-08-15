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
  const events = plan.days.flatMap(d =>
    d.events.map(e => ({ ...toDb({ ...e }), day_id: d.id }))
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
    days: plan.days.map(d => ({ id: d.id, date: d.date, label: d.label ?? null })),
    events,
    family_members: plan.family.map(f => toDb(f)),
    tasks: plan.tasks.map(t => toDb(t)),
    accommodations: plan.accommodations.map(a => toDb(a)),
    flights: plan.flights.map(f => ({ ...toDb(f), ...flightTimes(f, plan) })),
    car_rentals: (plan.carRentals ?? []).map(c => toDb(c)),
    budget_items: plan.budget.items.map(b => toDb(b)),
    packing_items: (plan.packingItems ?? []).map(p => toDb(p)),
    // documents are deliberately absent — save_trip() nukes-and-replaces its
    // children, and they live in their own table. See migration 0007.
  }
}
