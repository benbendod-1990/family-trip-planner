import type { TripPlan } from '../types/trip-plan'

/**
 * Signed-out catalog. Empty on purpose: Holland/Paris/Crete/Rome/USA are real
 * family trips, not public demos. Guests see a login CTA; membership comes
 * from Google sign-in + Supabase RLS (PR #10).
 *
 * Do not re-export FAMILY_SEED_TRIPS from this file — Home and the guest
 * persist path import demoData, and that would ship the USA itinerary to
 * anyone who opens the site.
 */
export const GUEST_TRIPS: TripPlan[] = []
