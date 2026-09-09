/**
 * Account-scoped trip persist keys.
 *
 * The unsigned guest catalog lives in `myk-trip-plan-store`. Each signed-in
 * user gets `myk-trip-plan-store:<userId>` so a shared iPhone cannot leak the
 * previous account's trips, and so guest demo seeds never share a cache with
 * an authenticated member list.
 *
 * `trip-store-account` remembers the last signed-in user so a cold start can
 * rehydrate the right key before the Supabase session resolves (avoids a
 * flash of Holland/Paris/Crete/Rome on an invitee's Home). Guest persist is
 * empty — never the family seed catalog.
 */

export const GUEST_TRIP_STORE_KEY = 'myk-trip-plan-store'
export const TRIP_STORE_ACCOUNT_HINT_KEY = 'trip-store-account'

export function tripStorePersistName(userId: string | null | undefined): string {
  return userId ? `${GUEST_TRIP_STORE_KEY}:${userId}` : GUEST_TRIP_STORE_KEY
}

let scopedUserId: string | null = null

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // private mode / quota — ignore; in-memory scope still works for the session
  }
}

export function readLastTripStoreAccount(): string | null {
  return readStorage(TRIP_STORE_ACCOUNT_HINT_KEY)
}

export function writeLastTripStoreAccount(userId: string | null): void {
  writeStorage(TRIP_STORE_ACCOUNT_HINT_KEY, userId)
}

/** Call once before creating the Zustand store so the first persist name matches. */
export function initTripStoreAccountFromHint(): string | null {
  scopedUserId = readLastTripStoreAccount()
  return scopedUserId
}

export function getTripStoreAccount(): string | null {
  return scopedUserId
}

export function setTripStoreAccount(userId: string | null): void {
  scopedUserId = userId
  writeLastTripStoreAccount(userId)
}

export function isGuestTripStore(): boolean {
  return scopedUserId == null
}

export function persistHasEntry(name: string): boolean {
  return readStorage(name) != null
}

/**
 * What to put in memory after pointing persist at another account.
 * Sign-out always resets to an empty guest catalog — never rehydrate the old
 * unscoped key (it may still hold family seeds or the previous user's trips).
 */
export type TripStoreAccountReset = 'noop' | 'guest-empty' | 'empty' | 'rehydrate'

export function planTripStoreAccountSwitch(
  previousUserId: string | null,
  nextUserId: string | null,
  nextKeyHasEntry: boolean,
): { persistName: string; resetTo: TripStoreAccountReset } {
  const persistName = tripStorePersistName(nextUserId)
  if (previousUserId === nextUserId) {
    return { persistName, resetTo: 'noop' }
  }
  if (nextUserId == null && previousUserId != null) {
    return { persistName, resetTo: 'guest-empty' }
  }
  if (nextKeyHasEntry) {
    return { persistName, resetTo: 'rehydrate' }
  }
  if (nextUserId == null) {
    return { persistName, resetTo: 'guest-empty' }
  }
  return { persistName, resetTo: 'empty' }
}
