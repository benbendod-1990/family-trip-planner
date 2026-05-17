import type { TripPlan } from '@/types/trip-plan'
import hollandTrip from './holland-trip.json'
import paristTrip from './paris-trip.json'
import creteTrip from './crete-trip.json'

// All known upcoming trips. The first one is auto-loaded into localStorage
// when the store is empty; the rest are available via "load sample" buttons.
export const DEMO_TRIPS: TripPlan[] = [
  creteTrip as TripPlan,
  hollandTrip as TripPlan,
  paristTrip as TripPlan,
]

export const DEMO_TRIP: TripPlan = DEMO_TRIPS[0]
