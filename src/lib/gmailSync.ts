// Gmail → trips sync.
//
// Flow:
//   1. Get a Gmail access token. Prefer the Supabase Google sign-in's
//      provider_token (no extra OAuth dance). If missing/expired, ask the
//      user to sign in again with Gmail scope.
//   2. Fetch recent travel emails via the existing fetchTravelEmails().
//   3. Parse each into structured Flight/Accommodation/CarRental.
//   4. Match each parsed item to a trip by *date inside the booking* (NOT
//      the email's send date). Item is matched to a trip if its primary
//      date falls within trip.startDate..trip.endDate (inclusive).
//   5. If no trip matches, create a new trip with sensible defaults
//      (range = booking date ± a few days; user can edit later).
//   6. Push changes through the local Zustand store. The user clicks
//      "סנכרן" afterward to push the result to Supabase.

import { useTripStore } from '@/stores/tripStore'
import { fetchTravelEmails } from '@/services/gmail'
import { parseEmails, type ParsedEmail } from '@/services/emailParser'
import { supabase } from './supabase'
import { generateId } from '@/utils/id'
import { getDaysBetween } from '@/utils/date'
import type { TripPlan } from '@/types/trip-plan'
import type { TripDay } from '@/types/trip'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'

export interface GmailSyncReport {
  scanned: number
  flightsAdded: number
  hotelsAdded: number
  carsAdded: number
  tripsCreated: number
  unmatched: number
}

async function getGmailToken(): Promise<string> {
  const { data: sess } = await supabase.auth.getSession()
  const tok = sess.session?.provider_token
  if (!tok) {
    throw new Error(
      'אין אסימון Gmail. צא והיכנס שוב עם Google — הפעם אבקש גישה ל-Gmail (read-only).'
    )
  }
  return tok
}

// Pick the trip whose [startDate, endDate] window covers `iso`. Returns
// undefined if none.
function findTripByDate(trips: TripPlan[], iso: string): TripPlan | undefined {
  const t = iso.slice(0, 10)
  return trips.find(tr => t >= tr.startDate && t <= tr.endDate)
}

function buildDays(startDate: string, endDate: string, existing: TripDay[] = []): TripDay[] {
  const dates = getDaysBetween(startDate, endDate)
  return dates.map(date => existing.find(d => d.date === date) ?? { id: generateId(), date, events: [] })
}

// Heuristic — extract a destination guess from a Flight or Accommodation.
function destinationOf(p: ParsedEmail): string | undefined {
  if (p.flight) return p.flight.arrivalAirport
  if (p.accommodation) return p.accommodation.address?.split(',').pop()?.trim() ?? p.accommodation.name
  if (p.carRental) return p.carRental.pickupLocation
  return undefined
}

function primaryDate(p: ParsedEmail): string | undefined {
  if (p.flight?.departureTime) return p.flight.departureTime
  if (p.accommodation?.checkIn) return p.accommodation.checkIn
  if (p.carRental?.pickupDate) return p.carRental.pickupDate
  return undefined
}

function endDate(p: ParsedEmail): string | undefined {
  if (p.flight?.arrivalTime) return p.flight.arrivalTime
  if (p.accommodation?.checkOut) return p.accommodation.checkOut
  if (p.carRental?.dropoffDate) return p.carRental.dropoffDate
  return undefined
}

// De-duplicate by confirmation number when present.
function alreadyHas<T extends { confirmationNumber?: string; id: string }>(
  list: T[],
  candidate: { confirmationNumber?: string }
): boolean {
  if (!candidate.confirmationNumber) return false
  return list.some(x => x.confirmationNumber === candidate.confirmationNumber)
}

export async function syncFromGmail(): Promise<GmailSyncReport> {
  const token = await getGmailToken()
  const messages = await fetchTravelEmails(token)
  const parsed = parseEmails(messages)

  const report: GmailSyncReport = {
    scanned: messages.length,
    flightsAdded: 0,
    hotelsAdded: 0,
    carsAdded: 0,
    tripsCreated: 0,
    unmatched: 0,
  }

  const store = useTripStore.getState()
  const trips = [...store.trips]

  for (const p of parsed) {
    if (p.type === 'unknown') continue
    const date = primaryDate(p)
    if (!date) continue

    let trip = findTripByDate(trips, date)
    if (!trip) {
      // Create a new trip — span = booking range (or ±2 days)
      const start = date.slice(0, 10)
      const end = (endDate(p) ?? date).slice(0, 10)
      const newTrip: TripPlan = {
        id: generateId(),
        name: `טיול ${destinationOf(p) ?? 'חדש'}`,
        destination: destinationOf(p) ?? 'לא ידוע',
        startDate: start,
        endDate: end >= start ? end : start,
        coverEmoji: '✈️',
        family: [],
        tasks: [],
        days: buildDays(start, end >= start ? end : start),
        budget: { currency: 'EUR', totalBudget: 0, items: [] },
        accommodations: [],
        flights: [],
        carRentals: [],
        packingItems: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      trips.push(newTrip)
      trip = newTrip
      report.tripsCreated++
    }

    const now = new Date().toISOString()
    if (p.flight && !alreadyHas(trip.flights, p.flight)) {
      const f: Flight = { ...p.flight, id: generateId() }
      trip.flights.push(f)
      report.flightsAdded++
    }
    if (p.accommodation && !alreadyHas(trip.accommodations, p.accommodation)) {
      const a: Accommodation = { ...p.accommodation, id: generateId() }
      trip.accommodations.push(a)
      report.hotelsAdded++
    }
    if (p.carRental && !alreadyHas(trip.carRentals ?? [], p.carRental)) {
      const c: CarRental = { ...p.carRental, id: generateId() }
      trip.carRentals = [...(trip.carRentals ?? []), c]
      report.carsAdded++
    }
    trip.updatedAt = now
  }

  useTripStore.setState({ trips })
  return report
}
