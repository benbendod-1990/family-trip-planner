import type { TripPlan } from '@/types/trip-plan'
import hollandTrip from './holland-trip.json'
import paristTrip from './paris-trip.json'
import creteTrip from './crete-trip.json'
import romeTrip from './rome-trip.json'
import usaTrip from './usa-trip.json'
import { withUsaSeedBudget } from './usaBudget'

/**
 * Real family trip seeds — authenticated seed-repair / Doc+booking helpers only.
 * Never import this module from the guest Home path. Signed-out visitors must
 * not receive these itineraries (see GUEST_TRIPS in demoData.ts).
 *
 * USA budget overlay: `src/data/usaBudget.ts` is the money source of truth
 * (JSON is kept in sync by test). Overlay so a missed JSON edit cannot ship
 * an empty USA ledger. `totalBudget` is 0 on purpose — not a whole-trip envelope.
 */
export const FAMILY_SEED_TRIPS: TripPlan[] = [
  creteTrip as TripPlan,
  hollandTrip as TripPlan,
  paristTrip as TripPlan,
  romeTrip as TripPlan,
  withUsaSeedBudget(usaTrip as TripPlan),
]

/** @deprecated Use FAMILY_SEED_TRIPS. Kept for authenticated call sites. */
export const DEMO_TRIPS = FAMILY_SEED_TRIPS
