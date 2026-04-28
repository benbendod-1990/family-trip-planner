import type { TripPlan } from '@/types/trip-plan'
import hollandTrip from './holland-trip.json'

// First-run trip auto-loaded into localStorage when the store is empty.
// Uses the user's actual upcoming Netherlands trip (UUIDs throughout, so
// it round-trips cleanly to Supabase via upsertWholeTrip).
export const DEMO_TRIP: TripPlan = hollandTrip as TripPlan
