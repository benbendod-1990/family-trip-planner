/**
 * Who may see / auto-push which trips after a signed-in cloud read.
 *
 * Guest Home still injects DEMO_TRIPS. Authenticated Home must not: an invitee
 * who is only on USA would otherwise keep Holland/Paris/Crete/Rome from the
 * local seed catalog, and first-login wireUp used to push those canonical
 * UUIDs through save_trip — claiming them if they did not yet exist.
 */

import type { TripPlan } from '@/types/trip-plan'
import { CANONICAL_SEED_IDS, ensureDemoTrips } from './dedupeDemoTrips.ts'

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

/**
 * Guest (signed-out) catalog: empty/legacy Italy demo → full seed list;
 * otherwise inject any missing seed by id. Authenticated rehydrate must not
 * call this.
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
  const onlyItalyDemo = existing.length === 1 && existing[0]?.id === LEGACY_ITALY_DEMO_ID
  if (existing.length === 0 || onlyItalyDemo) {
    return {
      trips: seeds.map(t => structuredClone(t)),
      droppedIds: [],
      redirects,
      replacedCatalog: true,
    }
  }
  const result = ensureDemoTrips(existing, seeds, redirects)
  return { ...result, replacedCatalog: false }
}
