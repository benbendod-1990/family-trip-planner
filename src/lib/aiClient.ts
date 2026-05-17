import { supabase } from './supabase'
import type { TripPlan } from '@/types/trip-plan'

const AI_BASE = import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8787'

export interface DealsRequest {
  destination: string
  startDate: string
  endDate: string
  origin: string
  destinationAirport: string
  current: {
    flight?: { airline: string; price?: number; currency?: string; bookingRef?: string }
    hotel?: { name: string; price: number; currency: string }[]
  }
  passengers: { adults: number; children: number }
}

export interface DealsFinding {
  type: 'flight' | 'hotel' | 'package'
  provider: string
  price: number
  currency: string
  url: string
  dates?: string
  beats_existing_by_pct: number
  notes?: string
}

export interface DealsResponse {
  summary: string
  alerts: string[]
  findings: DealsFinding[]
  scanned_sources: string[]
}

export interface BlogDigestRequest {
  destination: string
  startDate: string
  endDate: string
  passengers: { adults: number; children: number; childAges?: number[] }
  interests?: string[]
}

export interface BlogDigestResponse {
  summary: string
  must_visit: Array<{ name: string; why: string; source_url: string; single_source?: boolean; kid_friendly?: boolean }>
  avoid: Array<{ name: string; why: string; source_url: string }>
  kids_tips: Array<{ tip: string; source_url: string }>
  seasonal_warnings: Array<{ warning: string; source_url: string }>
  budget_notes: Array<{ note: string; source_url: string }>
  sources: string[]
}

async function callAi<TBody, TResult>(path: string, body: TBody): Promise<TResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  } else if (import.meta.env.VITE_AI_SHARED_SECRET) {
    headers['x-api-secret'] = import.meta.env.VITE_AI_SHARED_SECRET
  }
  const res = await fetch(`${AI_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`AI ${res.status}: ${errText.slice(0, 300)}`)
  }
  return (await res.json()) as TResult
}

export function scanDeals(req: DealsRequest): Promise<DealsResponse> {
  return callAi('/api/deals/scan', req)
}

export function fetchBlogDigest(req: BlogDigestRequest): Promise<BlogDigestResponse> {
  return callAi('/api/blog/digest', req)
}

export interface MapInsightsRequest {
  destination: string
  startDate: string
  endDate: string
  passengers: { adults: number; children: number; childAges?: number[] }
  points: Array<{
    id: string
    kind: 'destination' | 'accommodation' | 'event'
    name: string
    address?: string
    date?: string
    startTime?: string
    category?: string
  }>
}

export interface MapNearbyItem {
  name: string
  why: string
  walking_minutes: number
  kid_friendly: boolean
  source_url: string
}

export interface MapInsightsResponse {
  per_point: Array<{
    id: string
    tips: string[]
    nearby: MapNearbyItem[]
  }>
  connections: Array<{
    from_id: string
    to_id: string
    suggestion: string
    source_url: string
  }>
  sources: string[]
}

export function fetchMapInsights(req: MapInsightsRequest): Promise<MapInsightsResponse> {
  return callAi('/api/map/insights', req)
}

export interface ItineraryParseRequest {
  text: string
  destination: string
  startDate: string
  endDate: string
  today: string
  pinnedLocation?: { name?: string; address?: string }
}

export interface ParsedEvent {
  title: string
  date: string
  startTime: string
  endTime?: string
  category: 'activity' | 'meal' | 'transport' | 'rest' | 'tour'
  location?: string
  description?: string
  cost?: number
  confidence?: number
}

export interface ItineraryParseResponse {
  events: ParsedEvent[]
  notes?: string
}

export function parseItineraryText(req: ItineraryParseRequest): Promise<ItineraryParseResponse> {
  return callAi('/api/gemini/itinerary/parse', req)
}

// ── AI document import (PDF/email/text → bookings) ──────────────────────────

export interface ParseDocumentRequest {
  text: string
  hint?: {
    today?: string
    tripStart?: string
    tripEnd?: string
    destination?: string
    sourceFilename?: string
  }
}

export interface ParsedDocFlight {
  airline: string
  flightNumber: string
  departureAirport: string
  arrivalAirport: string
  departureTime: string
  arrivalTime: string
  cost?: number
  currency?: string
  direction: 'outbound' | 'return'
  cabinClass?: 'economy' | 'business' | 'first'
  confirmationNumber?: string
  baggageIncluded?: boolean
  ticketUrl?: string
  confidence?: number
}

export interface ParsedDocAccommodation {
  name: string
  type: 'hotel' | 'airbnb' | 'hostel' | 'villa' | 'other'
  address?: string
  checkIn: string
  checkOut: string
  cost?: number
  currency?: string
  confirmationNumber?: string
  notes?: string
  confidence?: number
}

export interface ParsedDocCarRental {
  company: string
  carModel?: string
  carCategory: 'economy' | 'compact' | 'midsize' | 'full-size' | 'suv' | 'van' | 'luxury'
  pickupLocation: string
  dropoffLocation?: string
  pickupDate: string
  dropoffDate: string
  cost?: number
  currency?: string
  confirmationNumber?: string
  driverName?: string
  includesInsurance?: boolean
  confidence?: number
}

export interface ParsedDocEvent {
  title: string
  date: string
  startTime: string
  endTime?: string
  location?: string
  category: 'activity' | 'meal' | 'transport' | 'rest' | 'tour'
  cost?: number
  currency?: string
  confidence?: number
}

export interface ParseDocumentResponse {
  documentType: 'flight' | 'hotel' | 'car_rental' | 'event' | 'mixed' | 'unknown'
  language?: string
  timesAreLocal?: boolean
  flights?: ParsedDocFlight[]
  accommodations?: ParsedDocAccommodation[]
  carRentals?: ParsedDocCarRental[]
  events?: ParsedDocEvent[]
  warnings?: string[]
}

export function parseDocument(req: ParseDocumentRequest): Promise<ParseDocumentResponse> {
  return callAi('/api/gemini/parse-document', req)
}

// Convenience: derive a DealsRequest from a TripPlan.
export function tripToDealsRequest(trip: TripPlan): DealsRequest | null {
  const outbound = trip.flights.find(f => f.direction === 'outbound')
  const ret = trip.flights.find(f => f.direction === 'return')
  const origin = outbound?.departureAirport ?? ret?.arrivalAirport
  const destAirport = outbound?.arrivalAirport ?? ret?.departureAirport
  if (!origin || !destAirport) return null

  return {
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    origin,
    destinationAirport: destAirport,
    current: {
      flight: outbound && {
        airline: outbound.airline,
        price: outbound.cost,
        currency: outbound.currency,
        bookingRef: outbound.confirmationNumber,
      },
      hotel: trip.accommodations.map(a => ({
        name: a.name,
        price: a.cost,
        currency: a.currency,
      })),
    },
    passengers: {
      adults: trip.family.filter(m => !m.isChild).length,
      children: trip.family.filter(m => m.isChild).length,
    },
  }
}
