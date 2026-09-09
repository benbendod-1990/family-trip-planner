/**
 * Who may see / auto-push which trips after a signed-in cloud read.
 *
 * Guest Home must never inject family seeds (Holland/Paris/Crete/Rome/USA).
 * Those are real trips: they appear only after Google sign-in AND an RLS
 * membership. Authenticated Home must not keep seeds the RLS read omitted —
 * first-login wireUp used to push those canonical UUIDs through save_trip.
 */

import type { TripPlan } from '@/types/trip-plan'
import {
  CANONICAL_SEED_IDENTITIES,
  CANONICAL_SEED_IDS,
  ensureDemoTrips,
  isNearDuplicateOfSeed,
} from './dedupeDemoTrips.ts'

export const LEGACY_ITALY_DEMO_ID = 'demo-italy-2026'

export function isCanonicalDemoSeedId(id: string): boolean {
  return CANONICAL_SEED_IDS.has(id)
}

export function remoteTripIds(remote: TripPlan[]): Set<string> {
  return new Set(remote.map(t => t.id))
}

/**
 * Canonical demo seeds the user is not a member of. These must never appear
 * on an authenticated Home and must never be auto-pushed via save_trip.
 */
export function isUnauthorizedDemoSeed(id: string, remoteIds: ReadonlySet<string>): boolean {
  return CANONICAL_SEED_IDS.has(id) && !remoteIds.has(id)
}

/** Local list to fold into a cloud read: drop leaked demo seeds, keep user-created local trips. */
export function dropUnauthorizedDemoSeeds(
  local: TripPlan[],
  remoteIds: ReadonlySet<string>,
): TripPlan[] {
  return local.filter(t => !isUnauthorizedDemoSeed(t.id, remoteIds))
}

/**
 * First-login / session-restore auto-push. Never includes a canonical seed
 * the RLS read did not return — those UUIDs belong to the family, not to
 * whoever happened to have the guest catalog in localStorage.
 */
export function localTripsSafeToAutoPush(
  trips: TripPlan[],
  remoteIds: ReadonlySet<string>,
): TripPlan[] {
  return trips.filter(t => !remoteIds.has(t.id) && !CANONICAL_SEED_IDS.has(t.id))
}

export function resolveActiveTripId(trips: TripPlan[], current: string | null | undefined): string | null {
  if (current && trips.some(t => t.id === current)) return current
  return trips[0]?.id ?? null
}

/** Family seed UUIDs (and the old Italy demo) — never shown to signed-out visitors. */
export function isPrivateFamilySeedId(id: string): boolean {
  return id === LEGACY_ITALY_DEMO_ID || CANONICAL_SEED_IDS.has(id)
}

/**
 * Guest-safe sample trips only. Canonical family ids are dropped even if a
 * caller accidentally passes FAMILY_SEED_TRIPS / DEMO_TRIPS.
 */
export function guestSafeSeeds(seeds: TripPlan[]): TripPlan[] {
  return seeds.filter(s => !isPrivateFamilySeedId(s.id))
}

export function isPrivateFamilySeedTrip(trip: Pick<TripPlan, 'id' | 'name' | 'destination' | 'startDate' | 'endDate'>): boolean {
  if (isPrivateFamilySeedId(trip.id)) return true
  return CANONICAL_SEED_IDENTITIES.some(seed =>
    isNearDuplicateOfSeed(trip, seed, CANONICAL_SEED_IDS),
  )
}

/** Drop cached USA/Holland/… seeds from a guest persist so old tabs don't keep them. */
export function dropPrivateFamilySeedsFromGuest(trips: TripPlan[]): {
  trips: TripPlan[]
  droppedIds: string[]
} {
  const droppedIds: string[] = []
  const kept = trips.filter(t => {
    if (isPrivateFamilySeedTrip(t)) {
      droppedIds.push(t.id)
      return false
    }
    return true
  })
  return { trips: kept, droppedIds }
}

/**
 * Guest (signed-out) catalog: strip private family seeds from any previous
 * persist, then inject only guest-safe samples (production: none).
 * Authenticated rehydrate must not call this.
 */
export function hydrateGuestTrips(
  existing: TripPlan[],
  seeds: TripPlan[],
  redirects: Record<string, string> = {},
): {
  trips: TripPlan[]
  droppedIds: string[]
  redirects: Record<string, string>
  replacedCatalog: boolean
} {
  const stripped = dropPrivateFamilySeedsFromGuest(existing)
  const safeSeeds = guestSafeSeeds(seeds)
  const onlyItalyDemo = existing.length === 1 && existing[0]?.id === LEGACY_ITALY_DEMO_ID
  const catalogWasPrivateOnly = stripped.trips.length === 0 && existing.length > 0

  if (existing.length === 0 || onlyItalyDemo || catalogWasPrivateOnly) {
    return {
      trips: safeSeeds.map(t => structuredClone(t)),
      droppedIds: stripped.droppedIds,
      redirects,
      replacedCatalog: true,
    }
  }

  const result = ensureDemoTrips(stripped.trips, safeSeeds, redirects)
  return {
    ...result,
    droppedIds: [...stripped.droppedIds, ...result.droppedIds],
    replacedCatalog: false,
  }
}
