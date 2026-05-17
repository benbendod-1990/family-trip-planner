// Shared logic for merging fresh booking data (from Gmail sync, AI document
// parse, manual import, …) into a trip's flights/accommodations/carRentals.
//
// Three non-trivial requirements:
//   1. UPGRADE placeholder rows. Existing rows that look like stubs (midnight
//      times, PNR-as-flight-number, hotel without street address, etc.) should
//      be REPLACED when fresh data arrives — not duplicated next to them.
//   2. Multi-leg bookings. A single PNR can cover multiple flight segments
//      (e.g. Aegean TLV→ATH→AMS). Per-leg dedup is structural (flight number +
//      airports), not per-PNR.
//   3. Cancellation + rebook. The original booking is canceled and the user
//      books a replacement under a NEW PNR (different airline, different
//      confirmation). The placeholder for that "slot" (e.g. outbound flight)
//      should be replaced even though the PNR doesn't match. See `slotMatcher`.

import type { Flight, Accommodation, CarRental } from '@/types/accommodation'

// ── Placeholder detectors ───────────────────────────────────────────────────

export function isPlaceholderFlight(f: Pick<Flight, 'departureTime' | 'flightNumber' | 'confirmationNumber'>): boolean {
  const t = f.departureTime ?? ''
  if (!t || t.endsWith('T00:00') || t.endsWith('T00:00:00') || t.endsWith('T00:00:00.000Z')) return true
  // PNR-as-flight-number bug — e.g. flightNumber="89G5SO" matches confirmation
  if (f.flightNumber && f.confirmationNumber && f.flightNumber === f.confirmationNumber) return true
  return false
}

export function isPlaceholderHotel(h: Pick<Accommodation, 'cost' | 'address'>): boolean {
  // City-only address looks like "Kaatsheuvel, Netherlands" — no digits, just two words/comma
  const noStreet = !h.address || /^[^\d]+,\s*[A-Za-z֐-׿\s]+$/.test(h.address.trim())
  return (h.cost === 0 || h.cost === undefined) && noStreet
}

export function isPlaceholderCar(c: Pick<CarRental, 'cost'>): boolean {
  return c.cost === 0 || c.cost === undefined
}

// True iff the trip has any placeholder rows the AI could likely fix from
// emails. Used to decide whether to bypass the incremental Gmail checkpoint
// (those emails are usually older than the checkpoint window).
export function tripHasPlaceholders(trip: {
  flights?: Flight[]
  accommodations?: Accommodation[]
  carRentals?: CarRental[]
}): boolean {
  if ((trip.flights ?? []).some(isPlaceholderFlight)) return true
  if ((trip.accommodations ?? []).some(isPlaceholderHotel)) return true
  if ((trip.carRentals ?? []).some(isPlaceholderCar)) return true
  return false
}

// ── Merge ───────────────────────────────────────────────────────────────────

export type MergeOutcome = 'added' | 'replaced' | 'skipped'

interface StructuralKeyable {
  flightNumber?: string
  departureAirport?: string
  arrivalAirport?: string
  checkIn?: string
  checkOut?: string
  pickupDate?: string
  dropoffDate?: string
}

function structuralKey(x: StructuralKeyable): string {
  if (x.flightNumber) return `f:${x.flightNumber}|${x.departureAirport ?? ''}>${x.arrivalAirport ?? ''}`
  if (x.checkIn) return `h:${x.checkIn}>${x.checkOut ?? ''}`
  if (x.pickupDate) return `c:${x.pickupDate}>${x.dropoffDate ?? ''}`
  return ''
}

// Caller-scoped state — tracks which PNRs have already had their placeholders
// dropped during the current merge batch so we don't keep re-dropping fresh
// rows just added in the same pass. Use `createMergeSession()` per sync run.
export interface MergeSession {
  placeholdersDroppedFor: Set<string>
}

export function createMergeSession(): MergeSession {
  return { placeholdersDroppedFor: new Set() }
}

export function mergeByConfirmation<T extends { id: string; confirmationNumber?: string } & StructuralKeyable>(
  list: T[],
  candidate: Omit<T, 'id'>,
  isPlaceholder: (x: T) => boolean,
  newId: () => string,
  session: MergeSession,
  slotMatcher?: (existing: T, candidate: Omit<T, 'id'>) => boolean,
): MergeOutcome {
  const cn = candidate.confirmationNumber
  let droppedAny = false
  if (cn && !session.placeholdersDroppedFor.has(cn)) {
    session.placeholdersDroppedFor.add(cn)
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].confirmationNumber === cn && isPlaceholder(list[i])) {
        list.splice(i, 1)
        droppedAny = true
      }
    }
  }
  // Slot replacement: when a real (non-placeholder) candidate arrives, drop any
  // existing placeholders that match the same logical slot — even if their PNR
  // differs. Example: an Aegean placeholder for the outbound is replaced when
  // a Sky Express outbound (different PNR) lands. Skipped when the candidate
  // is itself a placeholder, otherwise we'd just swap one stub for another.
  if (slotMatcher) {
    const candidateIsPlaceholder = isPlaceholder({ ...candidate, id: '__candidate__' } as T)
    if (!candidateIsPlaceholder) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (slotMatcher(list[i], candidate) && isPlaceholder(list[i])) {
          list.splice(i, 1)
          droppedAny = true
        }
      }
    }
  }
  const candKey = structuralKey(candidate as StructuralKeyable)
  if (candKey) {
    const dupIdx = list.findIndex(x => structuralKey(x as StructuralKeyable) === candKey)
    if (dupIdx >= 0) return 'skipped'
  }
  list.push({ ...candidate, id: newId() } as T)
  return droppedAny ? 'replaced' : 'added'
}

// Slot matcher for flights — same direction (outbound or return) is the same
// "slot" from the user's perspective. A real outbound flight, regardless of
// airline, supersedes any placeholder outbound.
export function sameFlightDirection(
  existing: Pick<Flight, 'direction'>,
  candidate: Pick<Flight, 'direction'>,
): boolean {
  return Boolean(existing.direction) && existing.direction === candidate.direction
}
