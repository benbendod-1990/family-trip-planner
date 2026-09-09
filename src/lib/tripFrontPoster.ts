import { catalogEntryForKey } from './placeCatalog.ts'
import {
  anyRectsOverlap,
  cssPxToView,
  placeMapChips,
  shortMapLabel,
  type PlacedChip,
  type Rect,
} from './mapLabelLayout.ts'
import {
  collectDayStops,
  type DayStop,
  type DayStopKind,
} from './tripMapDayStops.ts'
import {
  canonicalPlaceKey,
  extractTripMapPois,
  type TripMapPoi,
} from './tripMapPois.ts'
import type { TripDay } from '../types/trip.ts'
import type { TripPlan } from '../types/trip-plan.ts'

export interface FrontStay {
  id: string
  name: string
  dateRange: string
  type: string
}

export interface FrontStop {
  id: string
  index: number
  dayIds: string[]
  dates: string[]
  title: string
  chipTitle: string
  kind: DayStopKind
  emoji: string
  placeKey?: string
  blurb: string
  linkUrl?: string
  linkLabel?: string
  poiId?: string
}

export interface FrontRoadPoint {
  x: number
  y: number
  t: number
  nx: number
  ny: number
  angle: number
}

export interface FrontPosterLayout {
  width: number
  height: number
  roadD: string
  centerline: string
  start: { x: number; y: number }
  end: { x: number; y: number }
  stops: Array<FrontStop & FrontRoadPoint>
  chips: PlacedChip[]
  cars: Array<{ x: number; y: number; angle: number }>
  planes: Array<{ x: number; y: number; angle: number; arrive: boolean }>
}

export const FRONT_POSTER_WIDTH = 1000

const KIND_SCORE: Record<string, number> = {
  park: 100,
  island: 95,
  ship: 88,
  port: 86,
  beach: 80,
  airport: 72,
  city: 60,
  villa: 45,
  hotel: 45,
  other: 42,
  transport: 28,
  rest: 18,
  meal: 12,
}

const TBD = /^tbd\b/i

export function formatPosterDate(iso: string): string {
  const [, month, day] = iso.split('-')
  if (!month || !day) return iso
  return `${Number(day)}.${Number(month)}`
}

export function formatPosterDateRange(start: string, end: string): string {
  if (start === end) return formatPosterDate(start)
  return `${formatPosterDate(start)}–${formatPosterDate(end)}`
}

export function shortStayLabel(name: string): string {
  if (/utopia/i.test(name)) return 'Utopia of the Seas'
  const catalog = catalogEntryForKey(canonicalPlaceKey(name))
  if (catalog?.nameHe) return catalog.nameHe
  const cut = name
    .split(/\s*[/—–]\s*|\s*\(|\s+·\s+/)[0]
    ?.trim()
  return (cut && cut.length >= 3 ? cut : name).replace(/\s+/g, ' ').trim()
}

export function collectFrontStays(trip: Pick<TripPlan, 'accommodations'>): FrontStay[] {
  return [...(trip.accommodations ?? [])]
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .map(acc => ({
      id: acc.id,
      name: shortStayLabel(acc.name),
      dateRange: formatPosterDateRange(acc.checkIn, acc.checkOut),
      type: acc.type,
    }))
}

function looksLikeAirport(stop: DayStop): boolean {
  if (stop.kind === 'hotel' || stop.kind === 'villa' || stop.kind === 'park') return false
  return /airport|שדה תעופה|gurion|נתב|schiphol|fiumicino|\bfco\b|\bcdg\b|de gaulle|\(mia\)/i
    .test(`${stop.title} ${stop.location ?? ''}`)
}

function scoreStop(stop: DayStop, day: TripDay): number {
  let score = KIND_SCORE[stop.kind] ?? 30
  if (looksLikeAirport(stop) && stop.kind !== 'airport') score = Math.max(score, KIND_SCORE.airport)
  const blob = `${stop.title} ${stop.location ?? ''}`.toLowerCase()
  const label = (day.label ?? '').toLowerCase()
  if (/magic kingdom|animal kingdom|cococay|perfect day|efteling|beekse|utopia|epcot/.test(blob)) {
    score += 24
  }
  if (label.includes('מיאמי') && /miami/.test(blob)) score += 22
  if (label.includes('utopia') && /utopia/.test(blob)) score += 16
  if (/ירידה|צ׳ק-אאוט|checkout|נסיעה ל/.test(stop.title)) score -= 18
  if (TBD.test(stop.title) || TBD.test(day.label ?? '')) score -= 20
  if ((stop.blurb?.length ?? 0) >= 40) score += 4
  if (stop.poiId) score += 6
  return score
}

function pickHero(day: TripDay, pois: TripMapPoi[]): DayStop {
  const stops = collectDayStops(day, pois)
  return [...stops].sort((a, b) => scoreStop(b, day) - scoreStop(a, day))[0]
}

function mergeKey(stop: DayStop, day: TripDay): string {
  const loc = stop.location?.trim() ?? ''
  if (loc && !/^tbd\b/i.test(loc) && !/\(\s*at sea\s*\)|\bat sea\b|בים הפתוח/i.test(loc)) {
    return `place:${canonicalPlaceKey(loc)}`
  }
  if (stop.kind === 'ship' || /utopia|יום ים/.test(`${stop.title} ${day.label ?? ''}`)) {
    return 'ship:utopia'
  }
  if (
    stop.kind === 'rest'
    || TBD.test(stop.title)
    || TBD.test(day.label ?? '')
    || /מנוחה|חוף/.test(`${stop.title} ${day.label ?? ''}`)
  ) {
    return 'rest:buffer'
  }
  return `day:${day.id}`
}

/**
 * One illustrated stop per itinerary beat: the landmark of each day,
 * with consecutive same-place / TBD-rest days collapsed into a range.
 * Pure — re-run whenever days or stays change.
 */
export function collectFrontStops(
  trip: Pick<TripPlan, 'days' | 'accommodations'>,
  pois?: TripMapPoi[],
): FrontStop[] {
  const resolved = pois ?? extractTripMapPois(trip as TripPlan)
  const days = [...(trip.days ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const groups: Array<{ days: TripDay[]; hero: DayStop; key: string }> = []

  for (const day of days) {
    const hero = pickHero(day, resolved)
    const key = mergeKey(hero, day)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.days.push(day)
      continue
    }
    groups.push({ days: [day], hero, key })
  }

  return groups.map((g, index) => {
    const first = g.days[0]
    const catalog = g.hero.location
      ? catalogEntryForKey(canonicalPlaceKey(g.hero.location))
      : undefined
    const eventTitle = g.hero.title.replace(/^[^\p{L}\p{N}]+/u, '').trim()
    const landmarkTitle = /magic kingdom|animal kingdom|cococay|utopia|efteling|beekse|epcot/i.test(eventTitle)
    const rawTitle = (
      TBD.test(eventTitle)
        ? (first.label ?? '').replace(/^TBD\s*[—–-]\s*/i, '').trim() || 'מנוחה'
        : landmarkTitle
          ? eventTitle.replace(/^עלייה ל-?|^ירידה מ-?/i, '').trim()
          : (catalog?.nameHe || eventTitle || first.label || 'יום בטיול')
    ).replace(/^[^\p{L}\p{N}]+/u, '').trim()
    const kind = looksLikeAirport(g.hero) ? 'airport' : g.hero.kind
    return {
      id: `front:${first.id}:${g.hero.eventId}`,
      index: index + 1,
      dayIds: g.days.map(d => d.id),
      dates: g.days.map(d => d.date),
      title: rawTitle,
      chipTitle: /^utopia/i.test(rawTitle) ? 'Utopia' : shortMapLabel(rawTitle, 16),
      kind,
      emoji: g.hero.emoji,
      placeKey: g.hero.location,
      blurb: g.hero.blurb,
      linkUrl: g.hero.linkUrl,
      linkLabel: g.hero.linkLabel,
      poiId: g.hero.poiId,
    }
  })
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

function pointAtLength(pts: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
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

function tangentAt(
  pts: Array<{ x: number; y: number }>,
  t: number,
): FrontRoadPoint {
  const p = pointAtLength(pts, t)
  const a = pointAtLength(pts, Math.max(0, t - 0.02))
  const b = pointAtLength(pts, Math.min(1, t + 0.02))
  let tx = b.x - a.x
  let ty = b.y - a.y
  const len = Math.hypot(tx, ty) || 1
  tx /= len
  ty /= len
  return {
    x: p.x,
    y: p.y,
    t,
    nx: -ty,
    ny: tx,
    angle: Math.atan2(ty, tx),
  }
}

export function frontPosterViewBox(stopCount: number): { width: number; height: number } {
  const n = Math.max(1, stopCount)
  return {
    width: FRONT_POSTER_WIDTH,
    height: Math.max(1180, 200 + n * 196),
  }
}

/**
 * Tall scrapbook road: chronological top → bottom so a phone scrolls the
 * whole trip without a cramped landscape squeeze.
 */
export function layoutFrontPoster(
  stops: FrontStop[],
  variantSeed: string,
): FrontPosterLayout {
  const view = frontPosterViewBox(stops.length)
  const { width, height } = view
  const variant = hashVariant(variantSeed)
  const waves = 1.35 + (variant % 3) * 0.22
  const phase = ((variant % 8) / 8) * Math.PI
  const padX = 188
  const padY = 108
  const amp = Math.min(width / 2 - padX, width * (0.28 + (variant % 3) * 0.02))
  const samples = 48
  const spine: Array<{ x: number; y: number }> = []
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    const y = padY + t * (height - padY * 2)
    const x = width / 2 + Math.sin(t * Math.PI * waves + phase) * amp
    spine.push({ x: Math.min(width - padX, Math.max(padX, x)), y })
  }

  const n = Math.max(1, stops.length)
  const placed = (n === 1 ? [tangentAt(spine, 0.5)] : stops.map((_, i) => {
    const t = 0.06 + (i / (n - 1)) * 0.88
    return tangentAt(spine, t)
  }))

  const iconR = cssPxToView(28, width)
  const offset = cssPxToView(78, width)
  const titleBand: Rect = { x: 48, y: 0, w: width - 96, h: 56 }
  const chips = placeMapChips(
    stops.map((stop, i) => {
      const pt = placed[i] ?? placed[placed.length - 1]
      const side = i % 2 === 0 ? 1 : -1
      const date = formatPosterDateRange(stop.dates[0], stop.dates[stop.dates.length - 1])
      return {
        id: stop.id,
        ax: pt.x,
        ay: pt.y,
        text: `${date}\n${stop.chipTitle}`,
        preferDx: pt.nx * side * offset,
        preferDy: pt.ny * side * offset * 0.35,
      }
    }),
    view,
    { iconR, gap: cssPxToView(8, width), obstacles: [titleBand] },
  )

  const cars: FrontPosterLayout['cars'] = []
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].kind !== 'transport' && stops[i].kind !== 'airport') continue
    const t = n === 1 ? 0.4 : 0.06 + (i / Math.max(1, n - 1)) * 0.88 - 0.035
    const p = tangentAt(spine, Math.max(0.04, t))
    cars.push({ x: p.x, y: p.y, angle: p.angle * (180 / Math.PI) })
  }
  if (cars.length === 0 && n >= 2) {
    const p = tangentAt(spine, 0.22)
    cars.push({ x: p.x, y: p.y, angle: p.angle * (180 / Math.PI) })
  }

  const planes: FrontPosterLayout['planes'] = []
  const firstAir = stops.findIndex(s => s.kind === 'airport')
  const lastAir = (() => {
    for (let i = stops.length - 1; i >= 0; i--) if (stops[i].kind === 'airport') return i
    return -1
  })()
  if (firstAir >= 0) {
    const p = placed[firstAir]
    planes.push({
      x: p.x + p.nx * -56,
      y: p.y + p.ny * -56,
      angle: -18,
      arrive: true,
    })
  }
  if (lastAir >= 0 && lastAir !== firstAir) {
    const p = placed[lastAir]
    planes.push({
      x: p.x + p.nx * 56,
      y: p.y + p.ny * 56,
      angle: 16,
      arrive: false,
    })
  }

  return {
    width,
    height,
    roadD: catmullRomPath(spine),
    centerline: catmullRomPath(spine),
    start: spine[0],
    end: spine[spine.length - 1],
    stops: stops.map((stop, i) => ({ ...stop, ...(placed[i] ?? placed[0]) })),
    chips,
    cars,
    planes,
  }
}

export function frontChipsOverlap(layout: FrontPosterLayout, gap = 4): boolean {
  return anyRectsOverlap(layout.chips, gap)
}

/** Test helper: seed → poster in one call. */
export function buildTripFrontPoster(trip: TripPlan): {
  stops: FrontStop[]
  stays: FrontStay[]
  layout: FrontPosterLayout
} {
  const pois = extractTripMapPois(trip)
  const stops = collectFrontStops(trip, pois)
  return {
    stops,
    stays: collectFrontStays(trip),
    layout: layoutFrontPoster(stops, trip.id),
  }
}
