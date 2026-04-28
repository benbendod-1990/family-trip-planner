import type { TripPlan } from '@/types/trip-plan'
import type { TripEvent, TripDay } from '@/types/trip'
import type { BudgetItem, Budget } from '@/types/budget'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'
import type { FamilyMember } from '@/types/family'
import type { TripTask } from '@/types/task'
import type { PackingItem } from '@/types/packing'
import { supabase } from './supabase'

type Row = Record<string, unknown>

const snake = (s: string) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

function keys(obj: object, toKey: (k: string) => string): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(obj)) out[toKey(k)] = v
  return out
}
const toDb = (o: object) => keys(o, snake)
const fromDb = (o: object) => keys(o, camel)

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
// List all trips the current user is a member of.
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
  const [days, events, budget, flights, acc, cars, fam, tasks, packing] = await Promise.all([
    supabase.from('days').select('*').eq('trip_id', tripId).order('date'),
    supabase.from('events').select('*').eq('trip_id', tripId),
    supabase.from('budget_items').select('*').eq('trip_id', tripId),
    supabase.from('flights').select('*').eq('trip_id', tripId),
    supabase.from('accommodations').select('*').eq('trip_id', tripId),
    supabase.from('car_rentals').select('*').eq('trip_id', tripId),
    supabase.from('family_members').select('*').eq('trip_id', tripId),
    supabase.from('tasks').select('*').eq('trip_id', tripId),
    supabase.from('packing_items').select('*').eq('trip_id', tripId),
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

  return {
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
    coords: t.coords as TripPlan['coords'],
    createdAt: t.created_at as string,
    updatedAt: t.updated_at as string,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Upsert a full trip (seed an existing localStorage plan into Supabase).
// Used once for migration; after that, individual CRUD is preferred.
// ────────────────────────────────────────────────────────────────────────────
// Build the snake_case JSONB payload that save_trip(jsonb) expects.
function tripToPayload(plan: TripPlan): Record<string, unknown> {
  const events = plan.days.flatMap(d =>
    d.events.map(e => ({ ...toDb({ ...e }), day_id: d.id }))
  )
  return {
    id: plan.id,
    name: plan.name,
    destination: plan.destination,
    start_date: plan.startDate,
    end_date: plan.endDate,
    cover_emoji: plan.coverEmoji,
    total_budget: plan.budget?.totalBudget ?? 0,
    currency: plan.budget?.currency ?? 'EUR',
    coords: plan.coords ?? null,
    days: plan.days.map(d => ({ id: d.id, date: d.date, label: d.label ?? null })),
    events,
    family_members: plan.family.map(f => toDb(f)),
    tasks: plan.tasks.map(t => toDb(t)),
    accommodations: plan.accommodations.map(a => toDb(a)),
    flights: plan.flights.map(f => toDb(f)),
    car_rentals: (plan.carRentals ?? []).map(c => toDb(c)),
    budget_items: plan.budget.items.map(b => toDb(b)),
    packing_items: (plan.packingItems ?? []).map(p => toDb(p)),
  }
}

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

// ────────────────────────────────────────────────────────────────────────────
// Trip membership (sharing with spouse / family).
// ────────────────────────────────────────────────────────────────────────────

export interface TripMember {
  user_id: string
  email: string
  role: 'owner' | 'member'
  added_at: string
}

export async function inviteUserToTrip(tripId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('invite_user_to_trip', {
    _trip_id: tripId,
    _email: email,
  })
  if (error) throw error
}

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await supabase.rpc('list_trip_members', { _trip_id: tripId })
  if (error) throw error
  return (data ?? []) as TripMember[]
}

export async function removeUserFromTrip(tripId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_user_from_trip', {
    _trip_id: tripId,
    _target_user_id: userId,
  })
  if (error) throw error
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
