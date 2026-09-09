import { catalogEntryForKey, type MapPoiKind } from './placeCatalog.ts'
import { googleMapsUrl } from '../utils/maps.ts'
import type { TripCoords, TripPlan } from '../types/trip-plan.ts'

/** Drop pins farther than this from the trip focus (Florida vs TLV). */
export const REGION_FOCUS_KM = 1500

export interface PlaceCandidate {
  id: string
  key: string
  name: string
  location: string
  kind: MapPoiKind
  emoji: string
  blurb: string
  linkUrl: string
  linkLabel: string
  coords?: TripCoords
  eventIds: string[]
  dayDates: string[]
  dayLabels: string[]
}

export interface TripMapPoi extends PlaceCandidate {
  coords: TripCoords
}

const AT_SEA = /\(\s*at sea\s*\)|\bat sea\b|בים הפתוח|יום ים/i
const SHIP_ONLY = /^utopia of the seas$/i
const TBD_ONLY = /^tbd\b/i

const PLACE_ALIASES: Array<{ test: RegExp; key: string }> = [
  { test: /holiday\s*inn/i, key: 'holiday inn miami international airport' },
  { test: /magic\s*kingdom/i, key: 'magic kingdom, walt disney world' },
  { test: /animal\s*kingdom/i, key: "disney's animal kingdom" },
  { test: /coco\s*cay|cococay|perfect\s*day/i, key: 'perfect day at cococay' },
  { test: /miami\s*beach|מיאמי\s*ביץ/i, key: 'miami beach, florida' },
  { test: /solterra|village at solterra|davenport/i, key: 'solterra resort, davenport' },
  { test: /port\s*canaveral|פורט\s*קנוורל|\bcanaveral\b/i, key: 'port canaveral, florida' },
  { test: /ben\s*gurion|נתב.?ג|\btlv\b/i, key: 'ben gurion t3' },
  { test: /miami\s*international|\(mia\)|mia car rental|\bmia\b/i, key: 'miami international airport (mia)' },
]

export function normalizePlaceText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[״"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function canonicalPlaceKey(location: string): string {
  const raw = location.trim()
  for (const alias of PLACE_ALIASES) {
    if (alias.test.test(raw)) return alias.key
  }
  return normalizePlaceText(raw)
}

export function isSkippableMapLocation(location: string | undefined): boolean {
  const loc = location?.trim() ?? ''
  if (!loc) return true
  if (TBD_ONLY.test(loc) && loc.length < 12) return true
  if (AT_SEA.test(loc)) return true
  if (SHIP_ONLY.test(normalizePlaceText(loc))) return true
  return false
}

function kindEmoji(kind: MapPoiKind): string {
  switch (kind) {
    case 'airport': return '✈️'
    case 'park': return '🎢'
    case 'port': return '🚢'
    case 'island': return '🏝️'
    case 'beach': return '🏖️'
    case 'villa': return '🏡'
    case 'hotel': return '🏨'
    case 'city': return '📍'
    default: return '📍'
  }
}

function guessKind(location: string): MapPoiKind {
  const s = location.toLowerCase()
  if (/airport|שדה תעופה|נתב/.test(s)) return 'airport'
  if (/port |נמל|canaveral/.test(s)) return 'port'
  if (/beach|חוף/.test(s)) return 'beach'
  if (/resort|villa|וילה/.test(s)) return 'villa'
  if (/hotel|inn|מלון/.test(s)) return 'hotel'
  if (/park|disney|universal|kingdom/.test(s)) return 'park'
  return 'other'
}

function sentencesFrom(text: string, max = 3): string {
  const cleaned = text.replace(/\s+/g, ' ').replace(/⚠️/g, '').trim()
  if (!cleaned) return ''
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  return parts.slice(0, max).join(' ')
}

function fallbackBlurb(location: string, descriptions: string[]): string {
  const longest = descriptions
    .map(d => d.trim())
    .filter(d => d.length >= 24)
    .sort((a, b) => b.length - a.length)[0]
  const fromEvents = longest ? sentencesFrom(longest, 3) : ''
  if (fromEvents.length >= 40) return fromEvents
  return `נקודה מלוח הזמנים של הטיול: ${location}. המיקום מתעדכן יחד עם האירועים — לחצו לניווט.`
}

function haversineKm(a: TripCoords, b: TripCoords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

interface AccLike {
  id: string
  name: string
  address?: string
  notes?: string
  coords?: TripCoords
}

function pushSource(
  buckets: Map<string, {
    location: string
    eventIds: string[]
    dayDates: string[]
    dayLabels: string[]
    descriptions: string[]
    coords?: TripCoords
  }>,
  location: string,
  source: {
    eventId?: string
    dayDate?: string
    dayLabel?: string
    description?: string
    coords?: TripCoords
  },
) {
  const key = canonicalPlaceKey(location)
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = {
      location,
      eventIds: [],
      dayDates: [],
      dayLabels: [],
      descriptions: [],
    }
    buckets.set(key, bucket)
  }
  if (source.eventId && !bucket.eventIds.includes(source.eventId)) {
    bucket.eventIds.push(source.eventId)
  }
  if (source.dayDate && !bucket.dayDates.includes(source.dayDate)) {
    bucket.dayDates.push(source.dayDate)
  }
  if (source.dayLabel && !bucket.dayLabels.includes(source.dayLabel)) {
    bucket.dayLabels.push(source.dayLabel)
  }
  if (source.description?.trim()) bucket.descriptions.push(source.description)
  if (!bucket.coords && source.coords) bucket.coords = source.coords
}

/**
 * Build unique places from the live trip itinerary (and stays).
 * Pure: re-run whenever days/events/locations change.
 */
export function collectPlaceCandidates(trip: Pick<TripPlan, 'days' | 'accommodations'>): PlaceCandidate[] {
  const buckets = new Map<string, {
    location: string
    eventIds: string[]
    dayDates: string[]
    dayLabels: string[]
    descriptions: string[]
    coords?: TripCoords
  }>()

  for (const day of trip.days ?? []) {
    for (const event of day.events ?? []) {
      if (isSkippableMapLocation(event.location)) continue
      const location = event.location as string
      pushSource(buckets, location, {
        eventId: event.id,
        dayDate: day.date,
        dayLabel: day.label,
        description: event.description,
        coords: event.coords,
      })
    }
  }

  for (const acc of (trip.accommodations ?? []) as AccLike[]) {
    const loc = acc.address?.trim() || acc.name
    if (isSkippableMapLocation(loc) && isSkippableMapLocation(acc.name)) continue
    const location = !isSkippableMapLocation(acc.address) && acc.address?.trim()
      ? acc.address
      : acc.name
    pushSource(buckets, location, {
      eventId: `acc:${acc.id}`,
      description: acc.notes,
      coords: acc.coords,
    })
  }

  const out: PlaceCandidate[] = []
  for (const [key, bucket] of buckets) {
    const catalog = catalogEntryForKey(key)
    const kind = catalog?.kind ?? guessKind(bucket.location)
    const name = catalog?.nameHe ?? bucket.location
    const coords = bucket.coords ?? catalog?.coords
    out.push({
      id: `poi:${key}`,
      key,
      name,
      location: catalog?.nameHe ?? bucket.location,
      kind,
      emoji: catalog?.emoji ?? kindEmoji(kind),
      blurb: catalog?.blurb ?? fallbackBlurb(name, bucket.descriptions),
      linkUrl: catalog?.linkUrl ?? googleMapsUrl({
        address: bucket.location,
        lat: coords?.lat,
        lng: coords?.lon,
        label: name,
      }),
      linkLabel: catalog?.linkLabel ?? 'Google Maps',
      coords,
      eventIds: bucket.eventIds,
      dayDates: bucket.dayDates,
      dayLabels: bucket.dayLabels,
    })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, 'he'))
}

export function focusOriginForTrip(
  trip: Pick<TripPlan, 'coords' | 'destination'>,
  pois: Array<{ coords: TripCoords }>,
): TripCoords | null {
  if (trip.coords) return trip.coords
  if (pois.length === 0) return null
  const lat = pois.reduce((s, p) => s + p.coords.lat, 0) / pois.length
  const lon = pois.reduce((s, p) => s + p.coords.lon, 0) / pois.length
  return { lat, lon }
}

/** Keep the destination cluster; drop far home-airports that would flatten the map. */
export function focusRegionPois<T extends { coords: TripCoords }>(
  pois: T[],
  origin: TripCoords,
  maxKm = REGION_FOCUS_KM,
): T[] {
  const nearby = pois.filter(p => haversineKm(origin, p.coords) <= maxKm)
  return nearby.length > 0 ? nearby : pois
}

export function withResolvedCoords(
  candidates: PlaceCandidate[],
  extra: Record<string, TripCoords>,
): TripMapPoi[] {
  const out: TripMapPoi[] = []
  for (const c of candidates) {
    const coords = c.coords ?? extra[c.key]
    if (!coords) continue
    out.push({ ...c, coords })
  }
  return out
}

/** Test helper: extract + keep only region pins with coordinates. */
export function extractTripMapPois(trip: TripPlan): TripMapPoi[] {
  const candidates = collectPlaceCandidates(trip)
  const resolved = withResolvedCoords(candidates, {})
  const origin = focusOriginForTrip(trip, resolved)
  return origin ? focusRegionPois(resolved, origin) : resolved
}
