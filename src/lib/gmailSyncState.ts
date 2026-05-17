// Per-user persistence of the last successful Gmail sync timestamp,
// so each subsequent sync only fetches NEW messages (Gmail `after:` filter).
//
// Storage: localStorage. Per-user-account so two browsers / two accounts on
// the same device don't collide. If the entry is missing (first sync, or user
// cleared storage) the caller should fall back to the broad time window.
//
// On a refresh, we also stash the COUNT of messages processed in the last run
// so the UI can show a tooltip like "סונכרן לפני 4 דקות (87 מיילים נסרקו)".

const KEY_PREFIX = 'gmail-sync:'
const OVERLAP_SECONDS = 24 * 60 * 60   // re-scan last 24h to catch late-arriving / re-classified mail

interface SyncState {
  lastSyncIso: string
  lastScanned: number
  lastAdded: number
}

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function getLastSync(userId: string | undefined): SyncState | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return null
    return JSON.parse(raw) as SyncState
  } catch {
    return null
  }
}

// Returns Unix epoch SECONDS suitable for Gmail's `after:` filter, or undefined
// to signal "no checkpoint — do a full sweep". The 24h overlap protects against
// emails that arrive in our inbox shortly after the last sync but with a slightly
// earlier internal timestamp (provider clock skew / queued mail).
export function getSinceEpochSec(userId: string | undefined): number | undefined {
  const s = getLastSync(userId)
  if (!s) return undefined
  const ms = new Date(s.lastSyncIso).getTime()
  if (!Number.isFinite(ms)) return undefined
  return Math.floor(ms / 1000) - OVERLAP_SECONDS
}

export function recordSync(userId: string | undefined, summary: { scanned: number; added: number }): void {
  if (!userId) return
  const state: SyncState = {
    lastSyncIso: new Date().toISOString(),
    lastScanned: summary.scanned,
    lastAdded: summary.added,
  }
  try {
    localStorage.setItem(key(userId), JSON.stringify(state))
  } catch {
    // quota exceeded etc. — non-fatal
  }
}

export function clearSync(userId: string | undefined): void {
  if (!userId) return
  try { localStorage.removeItem(key(userId)) } catch { /* noop */ }
}
