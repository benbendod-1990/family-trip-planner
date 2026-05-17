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
import { fetchTravelEmails, type GmailMessage } from '@/services/gmail'
import { parseEmails, type ParsedEmail } from '@/services/emailParser'
import { parseDocument } from './aiClient'
import { getSinceEpochSec, recordSync } from './gmailSyncState'
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

  for (const p of parsed) {
    if (p.type === 'unknown') continue
    const date = primaryDate(p)
    if (!date) continue

    const trip = findTripByDate(trips, date)
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

  useTripStore.setState({ trips })
  recordSync(userId, {
    scanned: report.scanned,
    added: report.flightsAdded + report.hotelsAdded + report.carsAdded,
  })
  return report
}
