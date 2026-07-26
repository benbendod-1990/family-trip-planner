// The Crete & Holland seeds historically shipped with a far-future updatedAt
// so a refreshed seed would always win the newer-wins merge. That backfired on
// the core goal — cross-device edit sync: a real edit is stamped "now", which
// is OLDER than 2099, so newer-wins silently DISCARDED it and the edit never
// reached the other device (and the manual "סנכרן" button couldn't fix it
// either — same rule).
//
// We now normalize the sentinel to the trip's own createdAt at every boundary
// a trip enters the app — cloud read (hydrateTrip) and local rehydrate
// (tripStore) — so the merge comparisons never see 2099. Real edits then win
// and propagate, while seed *content* corrections still apply via the
// content-based one-shot replacements in tripStore.
export const SEED_FAR_FUTURE = '2099-12-31T23:59:59.999Z'

export function normalizeSeedTimestamp<T extends { updatedAt: string; createdAt: string }>(
  trip: T,
): T {
  return trip.updatedAt === SEED_FAR_FUTURE ? { ...trip, updatedAt: trip.createdAt } : trip
}
