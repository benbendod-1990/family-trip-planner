#!/usr/bin/env node
/**
 * Pushes seed trips from src/data into Supabase, from the Mac.
 *
 *   node scripts/push-trips.ts --dry-run
 *   node scripts/push-trips.ts
 *   node scripts/push-trips.ts --only rome
 *   node scripts/push-trips.ts --force        # also overwrite trips already in the cloud
 *
 * Why not the app's sync button: a trip that was never pushed is invisible to
 * the other phone and to scripts/pull-documents.ts, which needs the trip row to
 * exist before it can file a document against it. This gets the cloud into a
 * known state without needing whoever is signed in on a particular device.
 *
 * Why not the save_trip() RPC: that function reads auth.uid(), so calling it
 * needs a user JWT, which needs the project's JWT secret. This writes the same
 * tables with the service_role key instead — the column lists below mirror
 * save_trip() in supabase/migrations/0004, and must be kept in step with it.
 *
 * SAFETY: by default it refuses to touch a trip that already exists in the
 * cloud. Seeds are starting points, not live data — the cloud copy has the
 * itinerary edits, and overwriting it from a seed would throw them away.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { SEED_FAR_FUTURE } from '../src/lib/seedNormalize.ts'
import type { TripPlan } from '../src/types/trip-plan.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1]?.toLowerCase() : undefined

function keychain(key: string): string {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-s', `family-trip-planner/${key}`, '-w'],
      { encoding: 'utf8' },
    ).trim()
  } catch {
    throw new Error(
      `Missing Keychain entry "family-trip-planner/${key}". Run scripts/setup-keychain.sh.`,
    )
  }
}

function envValue(file: string, name: string): string {
  const line = readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .find(l => l.startsWith(`${name}=`))
  if (!line) throw new Error(`${name} not found in ${file}`)
  return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '')
}

const SUPABASE_URL = envValue('.env.production', 'VITE_SUPABASE_URL')
const SERVICE_KEY = keychain('supabase-service-key')

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.status === 204 || !res.headers.get('content-type')?.includes('json')
    ? null
    : res.json()
}

const nil = <T,>(v: T | undefined | null | '') => (v === undefined || v === '' ? null : v)

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  await rest(table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
}

async function pushTrip(trip: TripPlan, userId: string) {
  // The far-future sentinel would poison newer-wins for good if it reached the
  // cloud — a real edit stamped "now" is older than 2099 and would lose. Same
  // rule the app applies on every read boundary (lib/seedNormalize).
  const updatedAt = trip.updatedAt === SEED_FAR_FUTURE ? trip.createdAt : trip.updatedAt

  await rest('trips', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      start_date: trip.startDate,
      end_date: trip.endDate,
      cover_emoji: trip.coverEmoji ?? '🧳',
      total_budget: trip.budget?.totalBudget ?? 0,
      currency: trip.budget?.currency ?? 'EUR',
      coords: trip.coords ?? null,
      created_by: userId,
      created_at: trip.createdAt,
      updated_at: updatedAt,
    }),
  })

  // The trips_add_owner trigger only fires on a fresh insert, so make sure
  // membership exists either way — without it RLS hides the trip from the app.
  await rest('trip_members', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ trip_id: trip.id, user_id: userId, role: 'owner' }),
  })

  // Children: nuke + replace, exactly like save_trip() does.
  for (const table of [
    'events', 'days', 'budget_items', 'flights', 'accommodations',
    'car_rentals', 'family_members', 'tasks', 'packing_items',
  ]) {
    await rest(`${table}?trip_id=eq.${trip.id}`, { method: 'DELETE' })
  }

  await insertRows('days', (trip.days ?? []).map(d => ({
    id: d.id, trip_id: trip.id, date: d.date, label: nil(d.label),
  })))

  await insertRows('events', (trip.days ?? []).flatMap(d =>
    (d.events ?? []).map(e => ({
      id: e.id, trip_id: trip.id, day_id: d.id,
      start_time: nil(e.startTime), end_time: nil(e.endTime),
      title: e.title, description: nil(e.description), location: nil(e.location),
      category: e.category ?? 'activity', cost: nil(e.cost),
    })),
  ))

  await insertRows('family_members', (trip.family ?? []).map(f => ({
    id: f.id, trip_id: trip.id, name: f.name,
    emoji: f.emoji ?? '🙂', is_child: f.isChild ?? false,
  })))

  await insertRows('tasks', (trip.tasks ?? []).map(t => ({
    id: t.id, trip_id: trip.id, title: t.title, description: nil(t.description),
    due_date: nil(t.dueDate), assigned_to: nil(t.assignedTo),
    done: t.done ?? false, completed_at: nil(t.completedAt),
    created_at: t.createdAt, updated_at: t.updatedAt,
  })))

  await insertRows('accommodations', (trip.accommodations ?? []).map(a => ({
    id: a.id, trip_id: trip.id, name: a.name, type: a.type ?? 'hotel',
    address: nil(a.address), check_in: a.checkIn, check_out: a.checkOut,
    cost: a.cost ?? 0, currency: a.currency ?? 'EUR',
    confirmation_number: nil(a.confirmationNumber), notes: nil(a.notes), rating: nil(a.rating),
  })))

  // departure_time/arrival_time are NOT NULL, and a half-known booking (Crete's
  // return leg: airline but no date) would abort the whole trip's push. Drop
  // the row and say so rather than inventing a departure time — a made-up time
  // on a flight card is worse than a missing one.
  const flights = trip.flights ?? []
  const timed = flights.filter(f => f.departureTime && f.arrivalTime)
  for (const f of flights.filter(f => !timed.includes(f))) {
    console.log(`    ! skipped flight ${f.airline} ${f.flightNumber || '(no number)'} ` +
      `${f.departureAirport}→${f.arrivalAirport} — no departure/arrival time in the seed`)
  }

  // NOTE: `flights` has no notes column — save_trip() drops flight notes too,
  // so the seed's terminal/ticket detail lives only on the device. Not fixed
  // here on purpose: adding the column is a migration, and this script mirrors
  // save_trip() rather than diverging from it.
  await insertRows('flights', timed.map(f => ({
    id: f.id, trip_id: trip.id, airline: f.airline, flight_number: f.flightNumber,
    departure_airport: f.departureAirport, arrival_airport: f.arrivalAirport,
    departure_time: nil(f.departureTime), arrival_time: nil(f.arrivalTime),
    cost: f.cost ?? 0, currency: f.currency ?? 'EUR',
    direction: f.direction, cabin_class: f.cabinClass ?? 'economy',
    confirmation_number: nil(f.confirmationNumber), baggage_included: f.baggageIncluded ?? null,
  })))

  await insertRows('car_rentals', (trip.carRentals ?? []).map(c => ({
    id: c.id, trip_id: trip.id, company: c.company, car_model: nil(c.carModel),
    car_category: c.carCategory, pickup_location: c.pickupLocation,
    dropoff_location: nil(c.dropoffLocation),
    pickup_date: c.pickupDate, dropoff_date: c.dropoffDate,
    cost: c.cost ?? 0, currency: c.currency ?? 'EUR',
    confirmation_number: nil(c.confirmationNumber), driver_name: nil(c.driverName),
    includes_insurance: c.includesInsurance ?? null, notes: nil(c.notes),
  })))

  await insertRows('budget_items', (trip.budget?.items ?? []).map(b => ({
    id: b.id, trip_id: trip.id, category: b.category, label: b.label,
    planned: b.planned ?? 0, actual: nil(b.actual), date: nil(b.date),
    paid_by: nil(b.paidBy), notes: nil(b.notes),
  })))

  await insertRows('packing_items', (trip.packingItems ?? []).map(p => ({
    id: p.id, trip_id: trip.id, title: p.title, category: p.category ?? 'other',
    packed: p.packed ?? false, quantity: nil(p.quantity), notes: nil(p.notes),
  })))
}

async function main() {
  const creds = (await rest('gmail_credentials?select=user_id')) as Array<{ user_id: string }>
  if (!creds.length) {
    throw new Error('No user found in gmail_credentials — sign in with Google in the app once.')
  }
  const userId = creds[0].user_id

  const remote = (await rest('trips?select=id,name,updated_at')) as Array<{
    id: string; name: string; updated_at: string
  }>
  const remoteById = new Map(remote.map(t => [t.id, t]))

  const files = ['crete-trip.json', 'holland-trip.json', 'paris-trip.json', 'rome-trip.json', 'usa-trip.json']
  const trips: TripPlan[] = files
    .filter(f => !ONLY || f.includes(ONLY))
    .map(f => JSON.parse(readFileSync(join(ROOT, 'src/data', f), 'utf8')) as TripPlan)
  if (!trips.length) throw new Error(`--only ${ONLY} matched no seed file`)

  for (const trip of trips) {
    const already = remoteById.get(trip.id)
    if (already && !FORCE) {
      console.log(`↷ ${trip.name} — already in the cloud, left alone (--force to overwrite)`)
      continue
    }
    const counts =
      `${trip.days?.length ?? 0} days · ${trip.flights?.length ?? 0} flights · ` +
      `${trip.tasks?.length ?? 0} tasks`
    if (DRY_RUN) {
      console.log(`would push  ${trip.name}  (${counts})`)
      continue
    }
    try {
      await pushTrip(trip, userId)
      console.log(`✓ ${trip.name}  (${counts})`)
    } catch (e) {
      console.log(`✗ ${trip.name}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

main().catch(e => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
