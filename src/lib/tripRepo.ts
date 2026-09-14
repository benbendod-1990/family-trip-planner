import type { TripPlan } from '@/types/trip-plan'
import type { TripEvent, TripDay } from '@/types/trip'
import type { BudgetItem, Budget } from '@/types/budget'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'
import type { FamilyMember } from '@/types/family'
import type { TripTask } from '@/types/task'
import type { PackingItem } from '@/types/packing'
import { supabase } from './supabase'
import { assertSharePeekMatchesTrip } from './tripShareLink'
import { normalizeSeedTimestamp } from './seedNormalize'
import { rowToDocument } from './tripDocuments'
import { fromDb, tripToPayload } from './tripPayload'
import { dropCoveredLinkDocuments, mergeServerDocuments } from './seedBookingDocuments'
import {
  CANONICAL_SEED_IDENTITIES,
  CANONICAL_SEED_IDS,
  collapseSeedNearDuplicates,
  loadSeedDuplicateRedirects,
  saveSeedDuplicateRedirects,
  type CollapseResult,
} from './dedupeDemoTrips'
import { applyCanonicalSeedDocLink, docLinkFromCloudRow, ensureSeedDocLinks } from './seedDocLink'
import { parseInviteOutcome, type InviteOutcome } from './inviteError'

type Row = Record<string, unknown>

function describe(e: unknown, prefix?: string): Error {
  if (e instanceof Error) return prefix ? new Error(`${prefix}: ${e.message}`) : e
  if (e && typeof e === 'object') {
    const r = e as Record<string, unknown>
    const parts = [r.message, r.details, r.hint, r.code].filter(Boolean).join(' | ')
    return new Error(prefix ? `${prefix}: ${parts || 'unknown'}` : parts || 'unknown error')
  }
  return new Error(prefix ? `${prefix}: ${String(e)}` : String(e))
}

// ────────────────────────────────────────────────────────────────────────────
// List all trips the current user is a member of (RLS). Family-catalog
// emails are co-owners of every trip; other invitees only see memberships.
// ────────────────────────────────────────────────────────────────────────────
export async function listTrips(): Promise<TripPlan[]> {
  const { data: trips, error } = await supabase
    .from('trips')
    .select('*')
    .order('start_date', { ascending: true })
  if (error) throw describe(error, 'listTrips')
  return Promise.all((trips ?? []).map(t => hydrateTrip(t as Row)))
}

async function hydrateTrip(t: Row): Promise<TripPlan> {
  const tripId = t.id as string
  const [days, events, budget, flights, acc, cars, fam, tasks, packing, docs] = await Promise.all([
    supabase.from('days').select('*').eq('trip_id', tripId).order('date'),
    supabase.from('events').select('*').eq('trip_id', tripId),
    supabase.from('budget_items').select('*').eq('trip_id', tripId),
    supabase.from('flights').select('*').eq('trip_id', tripId),
    supabase.from('accommodations').select('*').eq('trip_id', tripId),
    supabase.from('car_rentals').select('*').eq('trip_id', tripId),
    supabase.from('family_members').select('*').eq('trip_id', tripId),
    supabase.from('tasks').select('*').eq('trip_id', tripId),
    supabase.from('packing_items').select('*').eq('trip_id', tripId),
    // Documents live in their own table rather than inside the trip payload:
    // save_trip() nukes-and-replaces its children, so a phone pushing a stale
    // trip would wipe documents the Mac had just filed. See migration 0007.
    supabase.from('trip_documents').select('*').eq('trip_id', tripId),
  ])

  const eventRows = (events.data ?? []) as Row[]
  const dayRows = (days.data ?? []) as Row[]
  const tripDays: TripDay[] = dayRows.map(d => ({
    id: d.id as string,
    date: d.date as string,
    label: d.label as string | undefined,
    events: eventRows
      .filter(e => e.day_id === d.id)
      .map(e => fromDb(e) as unknown as TripEvent),
  }))

  const b = (budget.data ?? []) as Row[]
  const budgetObj: Budget = {
    currency: (t.currency as string) ?? 'EUR',
    totalBudget: Number(t.total_budget ?? 0),
    items: b.map(x => fromDb(x) as unknown as BudgetItem),
  }

  return normalizeSeedTimestamp({
    id: tripId,
    name: t.name as string,
    destination: t.destination as string,
    startDate: t.start_date as string,
    endDate: t.end_date as string,
    coverEmoji: (t.cover_emoji as string) ?? '🧳',
    family: ((fam.data ?? []) as Row[]).map(x => fromDb(x) as unknown as FamilyMember),
    tasks: ((tasks.data ?? []) as Row[]).map(x => fromDb(x) as unknown as TripTask),
    days: tripDays,
    budget: budgetObj,
    accommodations: ((acc.data ?? []) as Row[]).map(x => fromDb(x) as unknown as Accommodation),
    flights: ((flights.data ?? []) as Row[]).map(x => fromDb(x) as unknown as Flight),
    carRentals: ((cars.data ?? []) as Row[]).map(x => fromDb(x) as unknown as CarRental),
    packingItems: ((packing.data ?? []) as Row[]).map(x => fromDb(x) as unknown as PackingItem),
    documents: dropCoveredLinkDocuments(((docs.data ?? []) as Row[]).map(rowToDocument)),
    coords: t.coords as TripPlan['coords'],
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
    ...docLinkFromCloudRow(t),
  })
}

/**
 * Fold a cloud read into the local trips: newer-wins on trip content.
 * File-documents always come from the server (they live in trip_documents,
 * never save_trip()). Link-only seed cards (El Al PNR, cruise reference)
 * are kept from local when the table doesn't have them yet — otherwise a
 * cloud pull with an empty documents list wiped the USA bookings.
 */
function mergeRemoteTripsById(local: TripPlan[], remote: TripPlan[]): TripPlan[] {
  const remoteById = new Map(remote.map(t => [t.id, t]))
  const merged = local.map(l => {
    const r = remoteById.get(l.id)
    if (!r) return l
    const winner = new Date(r.updatedAt) > new Date(l.updatedAt) ? r : l
    return applyCanonicalSeedDocLink({
      ...winner,
      documents: mergeServerDocuments(l.documents, r.documents),
      // Cloud rows may still omit doc_url (column added in 0010). Keep
      // whichever side still has the link, then fall back to the seed.
      docUrl: winner.docUrl || l.docUrl || r.docUrl,
      docTitle: winner.docTitle || l.docTitle || r.docTitle,
    })
  })
  for (const r of remote) {
    if (!merged.some(t => t.id === r.id)) merged.push(applyCanonicalSeedDocLink(r))
  }
  return merged
}

/**
 * Fold a cloud read into the local trips, then collapse seed near-duplicates
 * (see dedupeDemoTrips). Cloud pull unions by id, so a duplicate that still
 * lives in Supabase would otherwise reappear next to the canonical seed.
 */
export function foldRemoteTrips(local: TripPlan[], remote: TripPlan[]): CollapseResult {
  const merged = mergeRemoteTripsById(local, remote)
  const result = collapseSeedNearDuplicates(
    merged,
    CANONICAL_SEED_IDENTITIES,
    loadSeedDuplicateRedirects(),
  )
  saveSeedDuplicateRedirects(result.redirects)
  return { ...result, trips: ensureSeedDocLinks(result.trips) }
}

export function mergeRemoteTrips(local: TripPlan[], remote: TripPlan[]): TripPlan[] {
  return foldRemoteTrips(local, remote).trips
}

// ────────────────────────────────────────────────────────────────────────────
// Upsert a full trip (seed an existing localStorage plan into Supabase).
// Used once for migration; after that, individual CRUD is preferred.
// ────────────────────────────────────────────────────────────────────────────
// Single-RPC upsert: bypasses per-table RLS by going through a security-
// definer function. The function still verifies auth.uid() and ownership
// internally, so no security regression.
export async function upsertWholeTrip(plan: TripPlan): Promise<string> {
  const { data: sess } = await supabase.auth.getSession()
  if (!sess.session?.access_token) {
    throw new Error('Not signed in. Sign out and back in, then retry.')
  }
  const { error } = await supabase.rpc('save_trip', { _payload: tripToPayload(plan) })
  if (error) throw describe(error, `save_trip(${plan.name})`)
  return plan.id
}

export async function deleteTrip(tripId: string) {
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw error
}

/** Cloud-delete collapsed near-duplicates, but never a DEMO seed and never a trip that still holds documents. */
export async function deleteCollapsedDuplicates(
  droppedIds: string[],
  sources: TripPlan[],
): Promise<void> {
  if (!droppedIds.length) return
  const seedIds = CANONICAL_SEED_IDS
  const byId = new Map(sources.map(t => [t.id, t]))
  for (const id of droppedIds) {
    if (seedIds.has(id)) continue
    const src = byId.get(id)
    if ((src?.documents ?? []).length) continue
    try {
      await deleteTrip(id)
    } catch (e) {
      console.warn('[sync] cloud delete of collapsed duplicate failed', id, e)
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Trip membership (sharing with spouse / family).
// ────────────────────────────────────────────────────────────────────────────

export interface TripMember {
  user_id: string
  email: string
  role: 'owner' | 'member'
  added_at: string
}

export interface TripPendingInvite {
  email: string
  created_at: string
  role: 'owner' | 'member'
}

export type { InviteOutcome }

export async function inviteUserToTrip(tripId: string, email: string): Promise<InviteOutcome> {
  const { data, error } = await supabase.rpc('invite_user_to_trip', {
    _trip_id: tripId,
    _email: email,
  })
  if (error) throw describe(error, 'invite_user_to_trip')
  return parseInviteOutcome(data)
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await supabase.rpc('list_trip_members', { _trip_id: tripId })
  if (error) throw describe(error, 'list_trip_members')
  return (data ?? []) as TripMember[]
}

export async function listPendingTripInvites(tripId: string): Promise<TripPendingInvite[]> {
  const { data, error } = await supabase.rpc('list_pending_trip_invites', { _trip_id: tripId })
  if (error) throw describe(error, 'list_pending_trip_invites')
  return ((data ?? []) as Array<{ email: string; created_at: string; member_role?: 'owner' | 'member'; role?: 'owner' | 'member' }>).map(row => ({
    email: row.email,
    created_at: row.created_at,
    role: row.member_role ?? row.role ?? 'member',
  }))
}

export async function cancelTripInvite(tripId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_trip_invite', {
    _trip_id: tripId,
    _email: email,
  })
  if (error) throw describe(error, 'cancel_trip_invite')
}

export interface TripShareLink {
  token: string
  expires_at: string
  created_at: string
}

export interface TripSharePeek {
  trip_id: string
  trip_name: string
  destination: string
  cover_emoji: string
  expires_at: string
}

export interface TripShareClaim {
  trip_id: string
  already_member: boolean
}

function parseShareLinkRow(data: unknown): TripShareLink | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.token !== 'string' || typeof r.expires_at !== 'string') return null
  return {
    token: r.token,
    expires_at: r.expires_at,
    created_at: typeof r.created_at === 'string' ? r.created_at : r.expires_at,
  }
}

function parseSharePeekRow(data: unknown): TripSharePeek | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.trip_id !== 'string' || typeof r.trip_name !== 'string') return null
  return {
    trip_id: r.trip_id,
    trip_name: r.trip_name,
    destination: typeof r.destination === 'string' ? r.destination : '',
    cover_emoji: typeof r.cover_emoji === 'string' ? r.cover_emoji : '🧳',
    expires_at: typeof r.expires_at === 'string' ? r.expires_at : '',
  }
}

function parseShareClaimRow(data: unknown): TripShareClaim {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    throw new Error('claim_trip_share_link: empty response')
  }
  const r = row as Record<string, unknown>
  if (typeof r.trip_id !== 'string') {
    throw new Error('claim_trip_share_link: missing trip_id')
  }
  return {
    trip_id: r.trip_id,
    already_member: r.already_member === true,
  }
}

export async function getTripShareLink(tripId: string): Promise<TripShareLink | null> {
  const { data, error } = await supabase.rpc('get_trip_share_link', { _trip_id: tripId })
  if (error) throw describe(error, 'get_trip_share_link')
  return parseShareLinkRow(data)
}

async function confirmShareLinkTrip(tripId: string, row: TripShareLink): Promise<TripShareLink> {
  const peek = await peekTripShareLink(row.token)
  assertSharePeekMatchesTrip(tripId, peek)
  return row
}

export async function createOrGetTripShareLink(tripId: string): Promise<TripShareLink> {
  const { data, error } = await supabase.rpc('create_or_get_trip_share_link', { _trip_id: tripId })
  if (error) throw describe(error, 'create_or_get_trip_share_link')
  const row = parseShareLinkRow(data)
  if (!row) throw new Error('create_or_get_trip_share_link: empty response')
  return confirmShareLinkTrip(tripId, row)
}

export async function regenerateTripShareLink(tripId: string): Promise<TripShareLink> {
  const { data, error } = await supabase.rpc('regenerate_trip_share_link', { _trip_id: tripId })
  if (error) throw describe(error, 'regenerate_trip_share_link')
  const row = parseShareLinkRow(data)
  if (!row) throw new Error('regenerate_trip_share_link: empty response')
  return confirmShareLinkTrip(tripId, row)
}

export async function revokeTripShareLink(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_trip_share_link', { _trip_id: tripId })
  if (error) throw describe(error, 'revoke_trip_share_link')
}

export async function peekTripShareLink(token: string): Promise<TripSharePeek | null> {
  const { data, error } = await supabase.rpc('peek_trip_share_link', { _token: token })
  if (error) throw describe(error, 'peek_trip_share_link')
  return parseSharePeekRow(data)
}

export async function claimTripShareLink(token: string): Promise<TripShareClaim> {
  const { data, error } = await supabase.rpc('claim_trip_share_link', { _token: token })
  if (error) throw describe(error, 'claim_trip_share_link')
  return parseShareClaimRow(data)
}

/** Attach pending email invites for the signed-in user. Safe to call on every wireUp. */
export async function claimPendingInvites(): Promise<number> {
  const { data, error } = await supabase.rpc('claim_pending_invites')
  if (error) throw describe(error, 'claim_pending_invites')
  return typeof data === 'number' ? data : Number(data ?? 0)
}

export async function removeUserFromTrip(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_user_from_trip', {
    _trip_id: tripId,
    _target_user_id: userId,
  })
  if (error) throw describe(error, 'remove_user_from_trip')
}

// ────────────────────────────────────────────────────────────────────────────
// Bulk sync: push an array of local trips to Supabase.
// Returns a per-trip outcome so the UI can report partial failures.
// ────────────────────────────────────────────────────────────────────────────
export interface SyncOutcome {
  tripId: string
  tripName: string
  ok: boolean
  error?: string
}

export async function pushLocalToRemote(trips: TripPlan[]): Promise<SyncOutcome[]> {
  const results: SyncOutcome[] = []
  for (const trip of trips) {
    try {
      await upsertWholeTrip(trip)
      results.push({ tripId: trip.id, tripName: trip.name, ok: true })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      results.push({ tripId: trip.id, tripName: trip.name, ok: false, error })
    }
  }
  return results
}
