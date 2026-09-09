import type { TripPlan } from '@/types/trip-plan'
import hollandTrip from './holland-trip.json'
import paristTrip from './paris-trip.json'
import creteTrip from './crete-trip.json'
import romeTrip from './rome-trip.json'
import usaTrip from './usa-trip.json'

// All known upcoming trips. Empty stores get the full list; otherwise
// onRehydrateStorage injects any seed missing by id, then collapses a
// pre-existing near-duplicate (same destination family + overlapping dates
// + similar title) onto that seed so Home doesn't show two copies.
export const DEMO_TRIPS: TripPlan[] = [
  creteTrip as TripPlan,
  hollandTrip as TripPlan,
  paristTrip as TripPlan,
  romeTrip as TripPlan,
  usaTrip as TripPlan,
]

export const DEMO_TRIP: TripPlan = DEMO_TRIPS[0]
