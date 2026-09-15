import { isFamilyCatalogEmail } from './familyCatalog.ts'
import { rpcErrorText } from './inviteError.ts'

export type AdminUserTripRole = 'owner' | 'member'

export interface AdminUserTrip {
  trip_id: string
  trip_name: string
  role: AdminUserTripRole
}

export interface AdminRegisteredUser {
  user_id: string
  email: string
  registered_at: string
  trips: AdminUserTrip[]
}

export interface AdminPendingInvite {
  email: string
  trip_id: string
  trip_name: string
  role: AdminUserTripRole
  invited_at: string
}

export interface AdminRoster {
  users: AdminRegisteredUser[]
  pendingInvites: AdminPendingInvite[]
}

/** Same allowlist as the full trip catalog — UI gate only; the RPC is the real one. */
export function canViewAdminUsers(email: string | null | undefined): boolean {
  return isFamilyCatalogEmail(email)
}

function asRole(value: unknown): AdminUserTripRole {
  return value === 'owner' ? 'owner' : 'member'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function parseTrip(raw: unknown): AdminUserTrip | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const trip_id = asString(row.trip_id)
  const trip_name = asString(row.trip_name)
  if (!trip_id || !trip_name) return null
  return { trip_id, trip_name, role: asRole(row.role) }
}

function parseUser(raw: unknown): AdminRegisteredUser | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const user_id = asString(row.user_id)
  const email = asString(row.email)
  const registered_at = asString(row.registered_at)
  if (!user_id || !email) return null
  const trips = Array.isArray(row.trips)
    ? row.trips.map(parseTrip).filter((t): t is AdminUserTrip => t !== null)
    : []
  return { user_id, email, registered_at, trips }
}

function parsePending(raw: unknown): AdminPendingInvite | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const email = asString(row.email)
  const trip_id = asString(row.trip_id)
  const trip_name = asString(row.trip_name)
  const invited_at = asString(row.invited_at)
  if (!email || !trip_id || !trip_name) return null
  return { email, trip_id, trip_name, role: asRole(row.role), invited_at }
}

function unwrapPayload(data: unknown): Record<string, unknown> | null {
  if (typeof data === 'string') {
    try {
      return unwrapPayload(JSON.parse(data))
    } catch {
      return null
    }
  }
  if (Array.isArray(data)) return unwrapPayload(data[0])
  if (data && typeof data === 'object') return data as Record<string, unknown>
  return null
}

export function parseAdminRoster(data: unknown): AdminRoster {
  const payload = unwrapPayload(data)
  if (!payload) return { users: [], pendingInvites: [] }
  const usersRaw = payload.users
  const pendingRaw = payload.pending_invites ?? payload.pendingInvites
  return {
    users: Array.isArray(usersRaw)
      ? usersRaw.map(parseUser).filter((u): u is AdminRegisteredUser => u !== null)
      : [],
    pendingInvites: Array.isArray(pendingRaw)
      ? pendingRaw.map(parsePending).filter((p): p is AdminPendingInvite => p !== null)
      : [],
  }
}

export function adminRosterFailureStatus(e: unknown): string {
  const msg = rpcErrorText(e)
  if (msg.includes('forbidden')) return 'אין גישה'
  if (msg.includes('unauthenticated')) return 'צריך להתחבר כדי לראות את הרשימה'
  if (/could not find the function|PGRST202|schema cache/i.test(msg)) {
    return 'המיגרציה 0015 צריכה לרוץ ב-Supabase (העתק SQL מ-Quickstart)'
  }
  if (/failed to fetch|network|load failed/i.test(msg)) return 'אין חיבור לרשת'
  if (!msg || msg === 'שגיאה') return 'שגיאה לא ידועה'
  return `שגיאה: ${msg}`
}

export async function fetchAdminRegisteredUsers(): Promise<AdminRoster> {
  const { supabase } = await import('./supabase.ts')
  const { data, error } = await supabase.rpc('admin_list_registered_users')
  if (error) {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' | ')
    throw new Error(`admin_list_registered_users: ${parts || 'unknown'}`)
  }
  return parseAdminRoster(data)
}
