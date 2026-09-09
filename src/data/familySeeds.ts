import type { TripPlan } from '@/types/trip-plan'
import hollandTrip from './holland-trip.json'
import paristTrip from './paris-trip.json'
import creteTrip from './crete-trip.json'
import romeTrip from './rome-trip.json'
import usaTrip from './usa-trip.json'

/**
 * Real family trip seeds — authenticated seed-repair / Doc+booking helpers only.
 * Never import this module from the guest Home path. Signed-out visitors must
 * not receive these itineraries (see GUEST_TRIPS in demoData.ts).
 */
export const FAMILY_SEED_TRIPS: TripPlan[] = [
  creteTrip as TripPlan,
  hollandTrip as TripPlan,
  paristTrip as TripPlan,
  romeTrip as TripPlan,
  usaTrip as TripPlan,
]

/** @deprecated Use FAMILY_SEED_TRIPS. Kept for authenticated call sites. */
export const DEMO_TRIPS = FAMILY_SEED_TRIPS
