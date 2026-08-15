#!/usr/bin/env node
/**
 * Files every travel document out of Gmail and into Supabase — run from the Mac.
 *
 *   node scripts/pull-documents.ts --dry-run     # show what would be filed
 *   node scripts/pull-documents.ts               # actually file it
 *   node scripts/pull-documents.ts --since 90d   # only recent mail
 *
 * Why this lives here and not in the app: the browser path has to re-scan two
 * years of mail on every device that wants the documents, over cellular, with a
 * live Gmail token. Doing it once from the Mac and letting both phones read the
 * result out of the database is less work, less data, and means a phone never
 * needs Gmail access at all to see its tickets.
 *
 * Secrets come from the Keychain (scripts/setup-keychain.sh), never from a file.
 * It runs with the service_role key, which bypasses RLS — that is the reason it
 * is a local script and not something exposed over HTTP.
 *
 * Node strips the types at run time (v23+), so this imports the app's own Gmail
 * client and email parser directly rather than keeping a second copy of the
 * sender allowlist that would drift within a month.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { fetchTravelEmails, fetchAttachment, type GmailMessage } from '../src/services/gmail.ts'
import { parseEmails, type ParsedEmail } from '../src/services/emailParser.ts'
import type { TripPlan } from '../src/types/trip-plan.ts'
import { classifyDocument } from '../src/lib/documentKind.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const sinceArg = args[args.indexOf('--since') + 1]
const SINCE = args.includes('--since') ? sinceArg : undefined

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
const GOOGLE_CLIENT_ID = keychain('google-client-id')
const GOOGLE_CLIENT_SECRET = keychain('google-client-secret')

const BUCKET = 'trip-documents'

// ── Supabase REST ───────────────────────────────────────────────────────────

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
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${text.slice(0, 300)}`)
  }
  // `Prefer: return=minimal` answers 201 with an empty body but still labels it
  // application/json, so going straight to res.json() throws on success.
  return text ? JSON.parse(text) : null
}

// ── Gmail access token, minted the same way the Worker does ─────────────────

interface CredRow {
  user_id: string
  refresh_token: string
}

async function gmailAccessToken(): Promise<{ token: string; userId: string }> {
  const rows = (await rest('gmail_credentials?select=user_id,refresh_token')) as CredRow[]
  if (!rows.length) {
    throw new Error(
      'No row in gmail_credentials. Sign in with Google in the app once — that stores the refresh token.',
    )
  }
  if (rows.length > 1) {
    // Both spouses have signed in. Either inbox holds the same trips, but the
    // documents should come from one of them deterministically.
    console.log(`note: ${rows.length} Gmail accounts stored; using the first.`)
  }
  const { user_id, refresh_token } = rows[0]

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const body = (await res.json()) as { access_token?: string; error_description?: string; error?: string }
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Google refused the refresh token: ${body.error_description ?? body.error ?? res.status}. ` +
        'If the OAuth app is still in Testing mode the token expires after 7 days — sign in again in the app.',
    )
  }
  return { token: body.access_token, userId: user_id }
}

// ── Trips, with just enough of each to match an email to it ─────────────────

interface TripRow {
  id: string
  name: string
  destination: string
  start_date: string
  end_date: string
}

interface MatchableTrip extends TripRow {
  codes: string[]
  places: string[]
}

/**
 * Confirmation codes and place names the repo's seed knows about, for a trip
 * whose cloud copy is behind.
 *
 * The cloud copy is not always current — a trip edited in the app but never
 * synced still has months-old bookings in Postgres, and matching against those
 * misses the documents for everything booked since. The seed is checked in and
 * usually fresher. Only ever consulted for a trip id that already exists in the
 * cloud, so this widens what an existing trip recognises and can never invent
 * one or move a document between trips.
 */
function seedHints(tripId: string): { codes: string[]; places: string[] } {
  const codes = new Set<string>()
  const places = new Set<string>()
  for (const file of readdirSync(join(ROOT, 'src/data')).filter(f => f.endsWith('-trip.json'))) {
    const seed = JSON.parse(readFileSync(join(ROOT, 'src/data', file), 'utf8')) as TripPlan
    if (seed.id !== tripId) continue
    for (const value of [
      ...(seed.flights ?? []).map(f => f.confirmationNumber ?? ''),
      ...(seed.accommodations ?? []).map(a => a.confirmationNumber ?? ''),
      ...(seed.carRentals ?? []).map(c => c.confirmationNumber ?? ''),
    ]) {
      for (const piece of value.split(/[\s,/|]+/)) {
        if (piece.trim().length >= 5) codes.add(piece.trim().toLowerCase())
      }
    }
    for (const value of [
      seed.destination,
      ...(seed.accommodations ?? []).map(a => a.name ?? ''),
      ...(seed.days ?? []).flatMap(d =>
        (d.events ?? []).filter(e => e.category !== 'transport').map(e => e.location ?? ''),
      ),
    ]) {
      for (const piece of value.split(/[,—–|]/)) {
        if (piece.trim().length >= 8) places.add(piece.trim().toLowerCase())
      }
    }
  }
  return { codes: [...codes], places: [...places] }
}

async function loadTrips(): Promise<MatchableTrip[]> {
  const trips = (await rest(
    'trips?select=id,name,destination,start_date,end_date&order=start_date',
  )) as TripRow[]

  const [flights, accs, cars, events] = (await Promise.all([
    rest('flights?select=trip_id,confirmation_number'),
    rest('accommodations?select=trip_id,confirmation_number,name'),
    rest('car_rentals?select=trip_id,confirmation_number'),
    rest('events?select=trip_id,location,category'),
  ])) as [
    Array<{ trip_id: string; confirmation_number: string | null }>,
    Array<{ trip_id: string; confirmation_number: string | null; name: string | null }>,
    Array<{ trip_id: string; confirmation_number: string | null }>,
    Array<{ trip_id: string; location: string | null; category: string | null }>,
  ]

  return trips.map(t => {
    const codeSource = [
      ...flights.filter(x => x.trip_id === t.id).map(x => x.confirmation_number ?? ''),
      ...accs.filter(x => x.trip_id === t.id).map(x => x.confirmation_number ?? ''),
      ...cars.filter(x => x.trip_id === t.id).map(x => x.confirmation_number ?? ''),
    ]
    const codes = new Set<string>()
    for (const value of codeSource) {
      // A cell may hold several codes ("ZHU9F6 / ZH8EWV") — one per passenger.
      for (const piece of value.split(/[\s,/|]+/)) {
        if (piece.trim().length >= 5) codes.add(piece.trim().toLowerCase())
      }
    }

    const placeSource = [
      t.destination,
      ...accs.filter(x => x.trip_id === t.id).map(x => x.name ?? ''),
      // Transport stops are airports and stations every trip passes through;
      // they identify the traveller, not the trip.
      ...events
        .filter(x => x.trip_id === t.id && x.category !== 'transport')
        .map(x => x.location ?? ''),
    ]
    const places = new Set<string>()
    for (const value of placeSource) {
      for (const piece of value.split(/[,—–|]/)) {
        const p = piece.trim()
        if (p.length >= 8) places.add(p.toLowerCase())
      }
    }

    const hints = seedHints(t.id)
    for (const c of hints.codes) codes.add(c)
    for (const p of hints.places) places.add(p)

    return { ...t, codes: [...codes], places: [...places] }
  })
}

// ── Matching: which trip does this email's attachment belong to? ────────────

function primaryDate(p: ParsedEmail): string | undefined {
  return p.flight?.departureTime ?? p.accommodation?.checkIn ?? p.carRental?.pickupDate
}

function matchTrip(
  trips: MatchableTrip[],
  msg: GmailMessage,
  byMsgId: Map<string, MatchableTrip>,
): { trip: MatchableTrip; how: string } | undefined {
  const dated = byMsgId.get(msg.id)
  if (dated) return { trip: dated, how: 'booking date' }

  const hay = `${msg.subject} ${msg.from} ${msg.body || msg.snippet}`.toLowerCase()
  // A confirmation code the trip already holds is the strongest signal there
  // is — it belongs to exactly one booking on exactly one trip.
  for (const t of trips) {
    const hit = t.codes.find(c => hay.includes(c))
    if (hit) return { trip: t, how: `code ${hit.toUpperCase()}` }
  }
  for (const t of trips) {
    const hit = t.places.find(p => hay.includes(p))
    if (hit) return { trip: t, how: `place "${hit}"` }
  }
  return undefined
}

/** Storage rejects keys with spaces and non-ASCII, which Hebrew filenames have. */
function safeName(filename: string): string {
  return filename.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'document'
}

// ── Existing documents, so a re-run files nothing twice ─────────────────────

interface DocRow {
  id: string
  trip_id: string
  filename: string
  sha256: string | null
  source_message_id: string | null
}

async function loadExisting(): Promise<DocRow[]> {
  return (await rest(
    'trip_documents?select=id,trip_id,filename,sha256,source_message_id',
  )) as DocRow[]
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? '— dry run, nothing will be written —\n' : '')

  const { token } = await gmailAccessToken()
  const trips = await loadTrips()
  if (!trips.length) throw new Error('No trips in the database. Push them from the app first.')
  console.log(`trips: ${trips.map(t => t.name).join(' · ')}`)

  const existing = await loadExisting()
  const seenSource = new Set(existing.map(d => `${d.trip_id}|${d.source_message_id}|${d.filename}`))
  const seenHash = new Set(existing.filter(d => d.sha256).map(d => `${d.trip_id}|${d.sha256}`))
  console.log(`already filed: ${existing.length}`)

  const sinceEpochSec = SINCE ? parseSince(SINCE) : undefined
  const messages = await fetchTravelEmails(token, { sinceEpochSec, maxResults: 200 })
  console.log(`scanned ${messages.length} travel emails\n`)

  // Dates inside the bookings are what place an email on a trip. The regex
  // parser is enough for that and, unlike the AI path, costs no quota.
  const byMsgId = new Map<string, MatchableTrip>()
  for (const p of parseEmails(messages)) {
    const date = primaryDate(p)
    if (!date) continue
    const day = date.slice(0, 10)
    const trip = trips.find(t => day >= t.start_date && day <= t.end_date)
    if (trip) byMsgId.set(p.messageId.split(':')[0], trip)
  }

  let added = 0
  let skipped = 0
  let unmatched = 0

  for (const msg of messages) {
    if (!msg.attachments.length) continue
    const match = matchTrip(trips, msg, byMsgId)
    if (!match) {
      unmatched++
      console.log(`  ? ${msg.subject.slice(0, 70)} — no trip`)
      continue
    }
    const { trip, how } = match

    for (const att of msg.attachments) {
      if (seenSource.has(`${trip.id}|${msg.id}|${att.filename}`)) {
        skipped++
        continue
      }

      const blob = await fetchAttachment(token, msg.id, att.attachmentId, att.mimeType)
      const bytes = Buffer.from(await blob.arrayBuffer())
      const sha256 = createHash('sha256').update(bytes).digest('hex')

      // The same e-ticket arrives from the airline and again from a forward,
      // under two message ids and often two filenames. The bytes give it away.
      if (seenHash.has(`${trip.id}|${sha256}`)) {
        skipped++
        console.log(`  = ${att.filename} → ${trip.name} (duplicate bytes)`)
        continue
      }
      seenHash.add(`${trip.id}|${sha256}`)

      const id = crypto.randomUUID()
      const path = `${trip.id}/${id}-${safeName(att.filename)}`
      console.log(`  + ${att.filename} → ${trip.name}  [${how}]`)
      if (DRY_RUN) {
        added++
        continue
      }

      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': att.mimeType,
        },
        body: bytes,
      })
      if (!up.ok) {
        const body = await up.text().catch(() => '')
        if (/bucket not found/i.test(body)) {
          throw new Error(
            `Bucket "${BUCKET}" does not exist. Apply supabase/migrations/0007_trip_documents_table.sql first.`,
          )
        }
        console.log(`    ! upload failed (${up.status}) ${body.slice(0, 160)}`)
        continue
      }

      await rest('trip_documents', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          id,
          trip_id: trip.id,
          path,
          filename: att.filename,
          mime_type: att.mimeType,
          size: bytes.length,
          kind: classifyDocument(msg.subject, msg.from, att.filename),
          sha256,
          source_message_id: msg.id,
          source_subject: msg.subject,
          source_from: msg.from,
          added_at: new Date(msg.date).toISOString(),
        }),
      })
      added++
    }
  }

  console.log(
    `\n${DRY_RUN ? 'would file' : 'filed'} ${added} · skipped ${skipped} already there · ` +
      `${unmatched} emails with files matched no trip`,
  )
  if (!DRY_RUN && added) {
    console.log('Open the app on the phone and pull from the cloud to see them.')
  }
}

/** "90d" / "6m" / "2y" → Unix epoch seconds, for Gmail's `after:` filter. */
function parseSince(spec: string): number {
  const m = /^(\d+)([dmy])$/.exec(spec)
  if (!m) throw new Error(`--since expects something like 90d, 6m or 2y (got "${spec}")`)
  const n = Number(m[1])
  const days = m[2] === 'd' ? n : m[2] === 'm' ? n * 30 : n * 365
  return Math.floor(Date.now() / 1000) - days * 86400
}

main().catch(e => {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
