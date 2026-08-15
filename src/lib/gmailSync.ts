// Gmail → trips sync.
//
// Flow:
//   1. Get a Gmail access token from the Worker's token broker. The Worker
//      holds Google's refresh_token (stored at sign-in) and mints/refreshes
//      access tokens via Google's OAuth endpoint. We never depend on
//      Supabase's provider_token (which expires after ~1h and isn't refreshed).
//   2. Fetch recent travel emails via the existing fetchTravelEmails().
//   3. Parse each into structured Flight/Accommodation/CarRental.
//   4. Match each parsed item to a trip by *date inside the booking* (NOT
//      the email's send date). Item is matched to a trip if its primary
//      date falls within trip.startDate..trip.endDate (inclusive).
//   5. If no trip matches, the booking is SKIPPED and counted as unmatched.
//      We do NOT auto-create new trips — that bloated the list with junk
//      from old/unrelated bookings (random hotel from 2024, etc.). The
//      user creates trips explicitly; bookings only attach to those.
//   6. Push changes through the local Zustand store. The user clicks
//      "סנכרן" afterward to push the result to Supabase.

import { useTripStore } from '@/stores/tripStore'
import { fetchTravelEmails, fetchAttachment, type GmailMessage } from '@/services/gmail'
import { parseEmails, type ParsedEmail } from '@/services/emailParser'
import { parseDocument } from './aiClient'
import { getSinceEpochSec, recordSync } from './gmailSyncState'
import { uploadDocument, classifyDocument } from './tripDocuments'
import { supabase } from './supabase'
import { fetchGmailAccessToken } from './gmailToken'
import { generateId } from '@/utils/id'
import {
  createMergeSession, mergeByConfirmation, sameFlightDirection,
  isPlaceholderFlight, isPlaceholderHotel, isPlaceholderCar,
  tripHasPlaceholders,
} from './tripMerge'
import type { TripPlan } from '@/types/trip-plan'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'

export interface GmailSyncReport {
  scanned: number
  flightsAdded: number
  hotelsAdded: number
  carsAdded: number
  tripsCreated: number
  unmatched: number
  aiAugmented: number   // emails the regex parser missed/butchered, that AI rescued
  aiQuotaExceeded?: boolean  // true if Gemini returned 429 — sync stopped early
  aiSkipped?: number   // emails skipped because the AI loop was aborted on quota
  documentsAdded?: number      // e-tickets/vouchers filed from email attachments
  documentsUnavailable?: boolean  // Storage bucket missing — migration 0006 not run
}

async function getGmailContext(): Promise<{ token: string; userId?: string }> {
  const { data: sess } = await supabase.auth.getSession()
  const token = await fetchGmailAccessToken()
  return { token, userId: sess.session?.user?.id }
}

// Pick the trip whose [startDate, endDate] window covers `iso`. Returns
// undefined if none.
function findTripByDate(trips: TripPlan[], iso: string): TripPlan | undefined {
  const t = iso.slice(0, 10)
  return trips.find(tr => t >= tr.startDate && t <= tr.endDate)
}

function primaryDate(p: ParsedEmail): string | undefined {
  if (p.flight?.departureTime) return p.flight.departureTime
  if (p.accommodation?.checkIn) return p.accommodation.checkIn
  if (p.carRental?.pickupDate) return p.carRental.pickupDate
  return undefined
}

// (Merge / placeholder-detection logic lives in ./tripMerge — shared with
// SmartImportModal so manual document imports get the same upgrade behavior.)

// An email was NOT confidently handled by the regex parser if it produced
// nothing OR produced a flight/hotel with placeholder dates (midnight UTC),
// which the regex falls back to when it can't find real times.
function regexParseSucceeded(p: ParsedEmail | undefined): boolean {
  if (!p) return false
  if (p.flight) {
    const t = p.flight.departureTime ?? ''
    if (!t || t.endsWith('T00:00') || t.endsWith('T00:00:00') || t.endsWith('T00:00:00.000Z')) return false
    if (!p.flight.flightNumber) return false
    return true
  }
  if (p.accommodation) {
    return Boolean(p.accommodation.checkIn && p.accommodation.checkOut)
  }
  if (p.carRental) return true
  return false
}

// Send messages the regex parser missed to Gemini for structured extraction.
// Returns ParsedEmail records derived from Gemini's output.
//
// Quota handling: Gemini free tier caps at ~15 RPM and 1500 RPD. We pace each
// call by ~4.5 seconds (≈13 RPM, comfortably under the limit). If we still hit
// a 429 (e.g. another tab or device burned RPD), we abort the loop instead of
// burning the rest of the messages on calls that will all fail.
async function aiAugmentMissed(
  missed: GmailMessage[],
): Promise<{ parsed: ParsedEmail[]; quotaExceeded: boolean; skipped: number }> {
  if (!missed.length) return { parsed: [], quotaExceeded: false, skipped: 0 }
  const today = new Date().toISOString().slice(0, 10)
  const out: ParsedEmail[] = []
  const PACE_MS = 4_500
  for (let idx = 0; idx < missed.length; idx++) {
    const msg = missed[idx]
    if (idx > 0) await new Promise(r => setTimeout(r, PACE_MS))
    try {
      const text = `Subject: ${msg.subject}\nFrom: ${msg.from}\nDate: ${msg.date}\n\n${msg.body || msg.snippet}`
      const res = await parseDocument({ text, hint: { today, sourceFilename: msg.subject } })
      const base = { messageId: msg.id, subject: msg.subject, from: msg.from, date: msg.date }
      for (const f of res.flights ?? []) {
        out.push({
          ...base, type: 'flight',
          flight: {
            airline: f.airline,
            flightNumber: f.flightNumber,
            departureAirport: f.departureAirport,
            arrivalAirport: f.arrivalAirport,
            departureTime: f.departureTime,
            arrivalTime: f.arrivalTime,
            cost: f.cost ?? 0,
            currency: f.currency ?? 'EUR',
            direction: f.direction,
            cabinClass: f.cabinClass ?? 'economy',
            confirmationNumber: f.confirmationNumber,
            baggageIncluded: f.baggageIncluded,
            ticketUrl: f.ticketUrl,
          },
        })
      }
      for (const a of res.accommodations ?? []) {
        out.push({
          ...base, type: 'accommodation',
          accommodation: {
            name: a.name,
            type: a.type,
            address: a.address,
            checkIn: a.checkIn,
            checkOut: a.checkOut,
            cost: a.cost ?? 0,
            currency: a.currency ?? 'EUR',
            confirmationNumber: a.confirmationNumber,
            notes: a.notes,
          },
        })
      }
      for (const c of res.carRentals ?? []) {
        out.push({
          ...base, type: 'car-rental',
          carRental: {
            company: c.company,
            carModel: c.carModel,
            carCategory: c.carCategory,
            pickupLocation: c.pickupLocation,
            dropoffLocation: c.dropoffLocation,
            pickupDate: c.pickupDate,
            dropoffDate: c.dropoffDate,
            cost: c.cost ?? 0,
            currency: c.currency ?? 'EUR',
            confirmationNumber: c.confirmationNumber,
            driverName: c.driverName,
            includesInsurance: c.includesInsurance,
          },
        })
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      // 429 = Gemini quota exceeded (RPM or RPD). Bail — every remaining call
      // would fail the same way and burn time + create noise.
      if (/\b429\b|quota|rate.?limit/i.test(errMsg)) {
        console.warn('AI augment hit quota, aborting:', errMsg)
        return { parsed: out, quotaExceeded: true, skipped: missed.length - idx - 1 }
      }
      // Per-email failure is non-fatal; surface as console warning and move on.
      console.warn('AI augment failed for', msg.subject, e)
    }
  }
  return { parsed: out, quotaExceeded: false, skipped: 0 }
}

/**
 * Distinctive place names this trip already knows about — its destination, the
 * hotels, and every itinerary stop. Used to file an attachment that produced no
 * booking of its own.
 */
function tripPlaceTokens(trip: TripPlan): string[] {
  const raw = [
    trip.destination,
    ...(trip.accommodations ?? []).map(a => a.name ?? ''),
    // Transport stops are excluded on purpose: they're airports and stations
    // ("נמל התעופה בן גוריון", "Athens (ATH)") that every trip passes through,
    // so they identify the traveller, not the trip. Only where he actually
    // goes tells the trips apart.
    ...(trip.days ?? []).flatMap(d =>
      (d.events ?? []).filter(e => e.category !== 'transport').map(e => e.location ?? ''),
    ),
  ]
  const tokens = new Set<string>()
  for (const value of raw) {
    for (const piece of value.split(/[,—–|]/)) {
      const t = piece.trim()
      // Short words ("Bar", "Zoo") collide with ordinary prose; long ones like
      // "Spoorwegmuseum" or "Beekse Bergen" identify a trip almost uniquely.
      if (t.length >= 8) tokens.add(t.toLowerCase())
    }
  }
  return [...tokens]
}

/**
 * Every confirmation code this trip already knows — from its flights, hotels
 * and cars. A booking code is the one token in an e-ticket email that belongs
 * to exactly one trip, which makes it the most reliable way to file a PDF.
 */
function tripConfirmationCodes(trip: TripPlan): string[] {
  const raw = [
    ...(trip.flights ?? []).map(f => f.confirmationNumber ?? ''),
    ...(trip.accommodations ?? []).map(a => a.confirmationNumber ?? ''),
    ...(trip.carRentals ?? []).map(c => c.confirmationNumber ?? ''),
  ]
  const codes = new Set<string>()
  for (const value of raw) {
    // A cell may hold several codes ("ZHU9F6 / ZH8EWV") — one per passenger.
    for (const piece of value.split(/[\s,/|]+/)) {
      const t = piece.trim()
      // Under 5 chars matches by accident (a room number, a price); PNRs and
      // Booking.com references are all longer than that.
      if (t.length >= 5) codes.add(t.toLowerCase())
    }
  }
  return [...codes]
}

/**
 * Which trip an attachment-carrying email belongs to, for the emails that never
 * reach a trip through the booking path. Two independent signals, strongest
 * first — a confirmation code the trip already holds, then a place its
 * itinerary names. Both are deliberately strict: an email we can't tie to a
 * trip is left unfiled rather than filed onto a guess.
 */
function findTripForDocument(trips: TripPlan[], msg: GmailMessage): TripPlan | undefined {
  const hay = `${msg.subject} ${msg.from} ${msg.body || msg.snippet}`.toLowerCase()
  return (
    trips.find(t => tripConfirmationCodes(t).some(code => hay.includes(code))) ??
    trips.find(t => tripPlaceTokens(t).some(tok => hay.includes(tok)))
  )
}

interface DocumentPullOutcome {
  added: number
  /** Storage bucket missing — migration 0006 hasn't been run. */
  unavailable: boolean
}

/**
 * Downloads the PDFs/images hanging off booking emails and files them under
 * their trip. Failures here never fail the sync — the booking data is the
 * valuable part, and the bucket may simply not exist yet (migration 0006).
 */
async function pullDocuments(
  pending: Array<{ trip: TripPlan; msg: GmailMessage }>,
  token: string,
): Promise<DocumentPullOutcome> {
  const out: DocumentPullOutcome = { added: 0, unavailable: false }
  for (const { trip, msg } of pending) {
    trip.documents = trip.documents ?? []
    for (const att of msg.attachments) {
      // Same email + same filename means we already have it. Re-running a full
      // sweep must not pile up duplicates of every e-ticket.
      const already = trip.documents.some(
        d => d.sourceMessageId === msg.id && d.filename === att.filename,
      )
      if (already) continue
      try {
        const blob = await fetchAttachment(token, msg.id, att.attachmentId, att.mimeType)
        const doc = await uploadDocument(trip.id, {
          filename: att.filename,
          mimeType: att.mimeType,
          blob,
          kind: classifyDocument(msg.subject, msg.from, att.filename),
          addedAt: new Date(msg.date).toISOString(),
          sourceMessageId: msg.id,
          sourceSubject: msg.subject,
          sourceFrom: msg.from,
        })
        trip.documents.push(doc)
        trip.updatedAt = new Date().toISOString()
        out.added++
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        // One recognisable reason is worth surfacing: the bucket isn't there.
        if (/אחסון המסמכים לא הוגדר/.test(err)) out.unavailable = true
        console.warn('[gmail] document pull failed for', att.filename, e)
      }
    }
  }
  return out
}

export interface DocumentPullReport {
  /** Travel emails fetched. */
  scanned: number
  /** …of those, how many carried a PDF or scan. */
  withAttachments: number
  added: number
  /** Attachments whose email couldn't be tied to any trip. */
  unmatched: number
  documentsUnavailable?: boolean
}

/**
 * Files every travel document Gmail is holding, across all trips.
 *
 * Separate from syncFromGmail() on purpose. That one runs incrementally off a
 * checkpoint, so it only ever sees mail that arrived since the last sync — and
 * document filing was added long after the bookings themselves landed, which
 * left every existing e-ticket permanently out of reach behind the checkpoint.
 * This sweeps the full window and touches nothing but attachments, so it is
 * safe to re-run: a document already filed is recognised by its source email
 * and skipped.
 */
export async function pullAllDocuments(): Promise<DocumentPullReport> {
  const { token } = await getGmailContext()
  const messages = await fetchTravelEmails(token, { maxResults: 200 })
  const trips = [...useTripStore.getState().trips]

  const report: DocumentPullReport = {
    scanned: messages.length,
    withAttachments: 0,
    added: 0,
    unmatched: 0,
  }

  // Dates inside the bookings are what place an email on a trip; the regex
  // parser is enough for that and, unlike the AI path, costs no quota.
  const parsed = parseEmails(messages)
  const tripByMsgId = new Map<string, TripPlan>()
  for (const p of parsed) {
    const date = primaryDate(p)
    if (!date) continue
    const trip = findTripByDate(trips, date)
    if (trip) tripByMsgId.set(p.messageId.split(':')[0], trip)
  }

  const pending: Array<{ trip: TripPlan; msg: GmailMessage }> = []
  for (const msg of messages) {
    if (!msg.attachments.length) continue
    report.withAttachments++
    const trip = tripByMsgId.get(msg.id) ?? findTripForDocument(trips, msg)
    if (trip) pending.push({ trip, msg })
    else report.unmatched++
  }

  const outcome = await pullDocuments(pending, token)
  report.added = outcome.added
  if (outcome.unavailable) report.documentsUnavailable = true

  useTripStore.setState({ trips })
  return report
}

export interface SyncOptions {
  // Skip the incremental checkpoint and re-scan the full 2-year window.
  // Useful when existing trip data has placeholders that need AI upgrade —
  // those emails predate the checkpoint, so without this flag they'd be missed.
  forceFull?: boolean
}

export async function syncFromGmail(opts: SyncOptions = {}): Promise<GmailSyncReport> {
  const session = createMergeSession()
  const { token, userId } = await getGmailContext()
  // Auto-detect: if any trip has placeholder rows, fall back to full sweep so
  // older booking emails (Aegean, hotels) get re-parsed by AI on this pass.
  const initialTrips = useTripStore.getState().trips
  const needsFullSweep = opts.forceFull || initialTrips.some(tripHasPlaceholders)
  const sinceEpochSec = needsFullSweep ? undefined : getSinceEpochSec(userId)
  const messages = await fetchTravelEmails(token, { sinceEpochSec })
  const regexParsed = parseEmails(messages)

  // Find messages the regex parser couldn't confidently handle, send to Gemini.
  const handledIds = new Set(regexParsed.filter(regexParseSucceeded).map(p => p.messageId.split(':')[0]))
  const missed = messages.filter(m => !handledIds.has(m.id))
  const ai = await aiAugmentMissed(missed)
  const parsed = [...regexParsed.filter(regexParseSucceeded), ...ai.parsed]

  const report: GmailSyncReport = {
    scanned: messages.length,
    flightsAdded: 0,
    hotelsAdded: 0,
    carsAdded: 0,
    tripsCreated: 0,
    unmatched: 0,
    aiAugmented: ai.parsed.length,
    aiQuotaExceeded: ai.quotaExceeded,
    aiSkipped: ai.skipped,
  }

  const store = useTripStore.getState()
  const trips = [...store.trips]

  // Attachments ride on the email that produced a booking, so we collect them
  // as we match each parsed booking to a trip and upload once at the end —
  // Storage round-trips are far slower than the in-memory merge below.
  const msgById = new Map(messages.map(m => [m.id, m]))
  const pendingDocs: Array<{ trip: TripPlan; msg: GmailMessage }> = []

  for (const p of parsed) {
    if (p.type === 'unknown') continue
    const date = primaryDate(p)
    if (!date) continue

    const trip = findTripByDate(trips, date)
    if (trip) {
      const msg = msgById.get(p.messageId.split(':')[0])
      if (msg?.attachments.length && !pendingDocs.some(d => d.msg.id === msg.id)) {
        pendingDocs.push({ trip, msg })
      }
    }
    if (!trip) {
      // Booking date doesn't fall inside any existing trip → skip.
      // User must create the destination trip first; bookings only attach
      // to trips the user explicitly planned. Avoids junk-trip bloat.
      report.unmatched++
      continue
    }

    const now = new Date().toISOString()
    if (p.flight) {
      const outcome = mergeByConfirmation<Flight>(
        trip.flights, p.flight, isPlaceholderFlight, generateId, session,
        sameFlightDirection,
      )
      if (outcome !== 'skipped') report.flightsAdded++
    }
    if (p.accommodation) {
      const outcome = mergeByConfirmation<Accommodation>(
        trip.accommodations, p.accommodation, isPlaceholderHotel, generateId, session,
      )
      if (outcome !== 'skipped') report.hotelsAdded++
    }
    if (p.carRental) {
      trip.carRentals = trip.carRentals ?? []
      const outcome = mergeByConfirmation<CarRental>(
        trip.carRentals, p.carRental, isPlaceholderCar, generateId, session,
      )
      if (outcome !== 'skipped') report.carsAdded++
    }
    trip.updatedAt = now
  }

  // Emails that carried a document but produced no booking — attraction
  // tickets, mostly. File them by their confirmation code or the places they name.
  for (const msg of messages) {
    if (!msg.attachments.length) continue
    if (pendingDocs.some(d => d.msg.id === msg.id)) continue
    const trip = findTripForDocument(trips, msg)
    if (trip) pendingDocs.push({ trip, msg })
  }

  const docOutcome = await pullDocuments(pendingDocs, token)
  report.documentsAdded = docOutcome.added
  if (docOutcome.unavailable) report.documentsUnavailable = true

  useTripStore.setState({ trips })
  recordSync(userId, {
    scanned: report.scanned,
    added: report.flightsAdded + report.hotelsAdded + report.carsAdded,
  })
  return report
}
