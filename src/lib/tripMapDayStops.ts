import { catalogEntryForKey, type MapPoiKind } from './placeCatalog.ts'
import {
  canonicalPlaceKey,
  isSkippableMapLocation,
  type TripMapPoi,
} from './tripMapPois.ts'
import { googleMapsUrl } from '../utils/maps.ts'
import type { TripDay, TripEvent, TripEventCategory } from '../types/trip.ts'

export type DayStopKind = MapPoiKind | 'ship' | 'transport' | 'meal' | 'rest'

export interface DayStop {
  id: string
  eventId: string
  title: string
  time?: string
  endTime?: string
  location?: string
  category: TripEventCategory
  kind: DayStopKind
  emoji: string
  blurb: string
  linkUrl?: string
  linkLabel?: string
  poiId?: string
}

function stripEmojiPrefix(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+/u, '').trim() || title
}

function kindFromEvent(event: TripEvent, poi?: TripMapPoi): DayStopKind {
  if (poi) return poi.kind
  const loc = event.location ?? ''
  if (/\(\s*at sea\s*\)|\bat sea\b|יום ים|utopia/i.test(loc) || /🚢/.test(event.title)) {
    return 'ship'
  }
  if (event.category === 'transport') return 'transport'
  if (event.category === 'meal') return 'meal'
  if (event.category === 'rest') return 'rest'
  return 'other'
}

function emojiForKind(kind: DayStopKind, fallback: string): string {
  if (fallback && /\p{Extended_Pictographic}/u.test(fallback)) {
    const match = fallback.match(/\p{Extended_Pictographic}/u)
    if (match) return match[0]
  }
  switch (kind) {
    case 'airport': return '✈️'
    case 'park': return '🎢'
    case 'port': return '🚢'
    case 'island': return '🏝️'
    case 'beach': return '🏖️'
    case 'villa': return '🏡'
    case 'hotel': return '🏨'
    case 'ship': return '🚢'
    case 'transport': return '🚗'
    case 'meal': return '🍽️'
    case 'rest': return '😴'
    default: return '📍'
  }
}

function shortBlurb(event: TripEvent, poi?: TripMapPoi): string {
  if (poi?.blurb) return poi.blurb
  const d = (event.description ?? '').replace(/\s+/g, ' ').replace(/⚠️/g, '').trim()
  if (d.length >= 24) {
    const parts = d.split(/(?<=[.!?])\s+/).filter(Boolean)
    return parts.slice(0, 2).join(' ')
  }
  const title = stripEmojiPrefix(event.title)
  if (event.location) return `נקודה בלו״ז: ${title} (${event.location}).`
  return `נקודה בלו״ז: ${title}.`
}

/**
 * Every itinerary event becomes a milestone on that day's winding-road drawing.
 * At-sea / TBD days are kept here (they are dropped from the regional overview).
 */
export function collectDayStops(day: TripDay, pois: TripMapPoi[]): DayStop[] {
  const byKey = new Map(pois.map(p => [p.key, p]))
  const events = [...(day.events ?? [])].sort((a, b) =>
    (a.startTime ?? '').localeCompare(b.startTime ?? ''),
  )
  if (events.length === 0) {
    const title = (day.label ?? '').trim() || 'יום בטיול'
    return [{
      id: `daystop:${day.id}:empty`,
      eventId: day.id,
      title,
      category: 'other',
      kind: 'rest',
      emoji: '📝',
      blurb: day.label
        ? `${title}. עדיין אין פירוט בלו״ז — כשמוסיפים אירועים, הדרך המצוירת מתעדכנת.`
        : 'יום בלו״ז בלי אירועים עדיין. הוסיפו פעילות והאיור ייבנה מחדש.',
    }]
  }

  return events.map((event, index) => {
    const loc = event.location?.trim()
    const key = loc && !isSkippableMapLocation(loc) ? canonicalPlaceKey(loc) : ''
    const poi = key ? byKey.get(key) : undefined
    const catalog = key ? catalogEntryForKey(key) : undefined
    const kind = kindFromEvent(event, poi)
    const title = stripEmojiPrefix(event.title)
    const coords = event.coords ?? poi?.coords ?? catalog?.coords
    const linkUrl = poi?.linkUrl
      ?? catalog?.linkUrl
      ?? (loc
        ? googleMapsUrl({
            address: loc,
            lat: coords?.lat,
            lng: coords?.lon,
            label: title,
          })
        : undefined)
    return {
      id: `daystop:${day.id}:${event.id}:${index}`,
      eventId: event.id,
      title,
      time: event.startTime,
      endTime: event.endTime,
      location: loc,
      category: event.category,
      kind,
      emoji: poi?.emoji ?? emojiForKind(kind, event.title),
      blurb: shortBlurb(event, poi),
      linkUrl,
      linkLabel: poi?.linkLabel ?? catalog?.linkLabel ?? (linkUrl ? 'Google Maps' : undefined),
      poiId: poi?.id,
    }
  })
}

export type DayRoadTheme = 'disney' | 'sea' | 'island' | 'beach' | 'airport' | 'villa' | 'default'

export function dayRoadTheme(stops: DayStop[], label?: string): DayRoadTheme {
  const blob = `${label ?? ''} ${stops.map(s => `${s.title} ${s.location ?? ''} ${s.kind}`).join(' ')}`.toLowerCase()
  if (/cococay|perfect day|island/.test(blob)) return 'island'
  if (/at sea|יום ים|utopia|ship/.test(blob) && !/cococay/.test(blob)) return 'sea'
  if (/magic kingdom|animal kingdom|disney|🏰|🦁/.test(blob)) return 'disney'
  if (/airport|mia|נתב|טיס/.test(blob)) return 'airport'
  if (/beach|חוף|miami beach/.test(blob)) return 'beach'
  if (/solterra|villa|וילה/.test(blob)) return 'villa'
  return 'default'
}

export interface WindingRoadLayout {
  d: string
  centerline: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  stops: Array<{ x: number; y: number; t: number }>
}

function hashVariant(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

function catmullRomPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  const d = [`M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`)
  }
  return d.join(' ')
}

function polylineLength(pts: Array<{ x: number; y: number }>): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return n
}

function pointAtLength(
  pts: Array<{ x: number; y: number }>,
  t: number,
): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return pts[0]
  const total = polylineLength(pts)
  let remain = Math.max(0, Math.min(1, t)) * total
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (remain <= seg || i === pts.length - 1) {
      const u = seg === 0 ? 0 : remain / seg
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
      }
    }
    remain -= seg
  }
  return pts[pts.length - 1]
}

/**
 * Deterministic winding road for one day. Variant comes from the day id so
 * consecutive days snake differently without being random on each render.
 */
export function layoutWindingRoad(
  stopCount: number,
  variantSeed: string,
  width = 1000,
  height = 640,
): WindingRoadLayout {
  const variant = hashVariant(variantSeed)
  const waves = 1.35 + (variant % 4) * 0.28
  const phase = ((variant % 10) / 10) * Math.PI
  const amp = width * (0.22 + (variant % 5) * 0.012)
  const padX = 90
  const padY = 78
  const samples = 28
  const spine: Array<{ x: number; y: number }> = []
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    const y = height - padY - t * (height - padY * 2)
    const x = width / 2 + Math.sin(t * Math.PI * waves + phase) * amp
    const clamped = Math.min(width - padX, Math.max(padX, x))
    spine.push({ x: clamped, y })
  }
  const n = Math.max(1, stopCount)
  const stops: Array<{ x: number; y: number; t: number }> = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : 0.1 + (i / (n - 1)) * 0.8
    const p = pointAtLength(spine, t)
    stops.push({ ...p, t })
  }
  return {
    d: catmullRomPath(spine),
    centerline: catmullRomPath(spine),
    start: spine[0],
    end: spine[spine.length - 1],
    stops,
  }
}
