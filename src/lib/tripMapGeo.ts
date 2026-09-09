import type { TripCoords } from '../types/trip-plan.ts'
import { cssPxToView, placeMapChips, shortMapLabel, type PlacedChip, type Rect } from './mapLabelLayout.ts'

export interface GeoPoint {
  x: number
  y: number
}

export interface GeoBox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export const MAP_VIEW = { width: 1000, height: 920 } as const

export function overviewViewBox(poiCount: number): { width: number; height: number } {
  return {
    width: MAP_VIEW.width,
    height: Math.max(MAP_VIEW.height, 680 + Math.max(0, poiCount) * 26),
  }
}

export interface WaterLabel {
  lat: number
  lon: number
  text: string
}

export interface RegionPack {
  id: string
  /** All focused POIs must sit inside this box to use the silhouette. */
  contains: GeoBox
  /** Frame used when the pack matches, so the land shape stays recognizable. */
  frame: GeoBox
  rings: Array<Array<[number, number]>>
  labels?: WaterLabel[]
}

const FLORIDA_PENINSULA: Array<[number, number]> = [
  [29.92, -81.32], [29.35, -81.05], [28.78, -80.74], [28.47, -80.53],
  [28.05, -80.54], [27.48, -80.32], [26.92, -80.12], [26.35, -80.07],
  [25.92, -80.12], [25.55, -80.18], [25.22, -80.28], [25.01, -80.42],
  [24.78, -80.72], [24.58, -81.22], [24.55, -81.72], [24.78, -81.92],
  [25.18, -81.28], [25.62, -81.52], [26.08, -81.80], [26.55, -82.02],
  [27.05, -82.42], [27.52, -82.72], [27.95, -82.72], [28.42, -82.70],
  [28.95, -82.78], [29.48, -83.02], [29.85, -82.42], [29.95, -81.72],
  [29.92, -81.32],
]

const COCOCAY: Array<[number, number]> = [
  [25.86, -77.98], [25.85, -77.88], [25.80, -77.86],
  [25.77, -77.94], [25.80, -78.00], [25.86, -77.98],
]

const NETHERLANDS: Array<[number, number]> = [
  [53.48, 4.72], [53.40, 6.20], [53.18, 7.12], [52.50, 7.00],
  [51.90, 6.85], [51.45, 6.20], [51.20, 5.85], [50.78, 5.90],
  [51.15, 4.20], [51.55, 3.55], [51.90, 3.85], [52.40, 4.50],
  [52.90, 4.65], [53.48, 4.72],
]

const CRETE: Array<[number, number]> = [
  [35.55, 23.52], [35.38, 23.55], [35.20, 24.05], [35.18, 24.85],
  [35.00, 25.75], [35.02, 26.30], [35.22, 26.32], [35.40, 25.70],
  [35.48, 24.90], [35.58, 24.15], [35.55, 23.52],
]

/**
 * Optional silhouettes. Matched only when every pin is inside `contains`.
 * Unknown future trips fall through to a hull drawn from their own coordinates.
 */
export const REGION_PACKS: RegionPack[] = [
  {
    id: 'florida',
    contains: { minLat: 24.3, maxLat: 30.5, minLon: -83.5, maxLon: -76.3 },
    frame: { minLat: 24.32, maxLat: 30.12, minLon: -83.22, maxLon: -76.48 },
    rings: [FLORIDA_PENINSULA, COCOCAY],
    labels: [
      { lat: 27.6, lon: -82.55, text: 'מפרץ מקסיקו' },
      { lat: 27.4, lon: -78.6, text: 'האוקיינוס האטלנטי' },
      { lat: 26.35, lon: -77.55, text: 'בהאמה' },
    ],
  },
  {
    id: 'netherlands',
    contains: { minLat: 50.6, maxLat: 53.7, minLon: 3.2, maxLon: 7.4 },
    frame: { minLat: 50.7, maxLat: 53.6, minLon: 3.3, maxLon: 7.3 },
    rings: [NETHERLANDS],
    labels: [
      { lat: 52.6, lon: 4.1, text: 'ים הצפון' },
      { lat: 51.4, lon: 6.5, text: 'גרמניה' },
    ],
  },
  {
    id: 'crete',
    contains: { minLat: 34.8, maxLat: 35.8, minLon: 23.3, maxLon: 26.5 },
    frame: { minLat: 34.85, maxLat: 35.75, minLon: 23.35, maxLon: 26.45 },
    rings: [CRETE],
    labels: [{ lat: 34.95, lon: 24.8, text: 'הים התיכון' }],
  },
]

export function boxContains(box: GeoBox, lat: number, lon: number): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon
}

export function matchingRegionPack(coords: TripCoords[]): RegionPack | undefined {
  if (coords.length === 0) return undefined
  return REGION_PACKS.find(pack => coords.every(c => boxContains(pack.contains, c.lat, c.lon)))
}

export function boxFromCoords(coords: TripCoords[], padRatio = 0.22): GeoBox {
  if (coords.length === 0) {
    return { minLat: 31.5, maxLat: 33.0, minLon: 34.2, maxLon: 35.6 }
  }
  let minLat = coords[0].lat
  let maxLat = coords[0].lat
  let minLon = coords[0].lon
  let maxLon = coords[0].lon
  for (const c of coords) {
    minLat = Math.min(minLat, c.lat)
    maxLat = Math.max(maxLat, c.lat)
    minLon = Math.min(minLon, c.lon)
    maxLon = Math.max(maxLon, c.lon)
  }
  const latSpan = Math.max(maxLat - minLat, 0.35)
  const lonSpan = Math.max(maxLon - minLon, 0.45)
  const latPad = latSpan * padRatio
  const lonPad = lonSpan * padRatio
  const latMid = (minLat + maxLat) / 2
  const lonMid = (minLon + maxLon) / 2
  return {
    minLat: latMid - latSpan / 2 - latPad,
    maxLat: latMid + latSpan / 2 + latPad,
    minLon: lonMid - lonSpan / 2 - lonPad,
    maxLon: lonMid + lonSpan / 2 + lonPad,
  }
}

export function projectLonLat(
  lat: number,
  lon: number,
  box: GeoBox,
  view: { width: number; height: number } = MAP_VIEW,
): GeoPoint {
  const x = ((lon - box.minLon) / (box.maxLon - box.minLon)) * view.width
  const y = ((box.maxLat - lat) / (box.maxLat - box.minLat)) * view.height
  return { x, y }
}

function convexHull(points: GeoPoint[]): GeoPoint[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length <= 2) return pts
  const cross = (o: GeoPoint, a: GeoPoint, b: GeoPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: GeoPoint[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: GeoPoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function inflatePolygon(points: GeoPoint[], pad: number): GeoPoint[] {
  if (points.length === 0) return []
  if (points.length === 1) {
    const p = points[0]
    return [
      { x: p.x - pad, y: p.y },
      { x: p.x, y: p.y - pad },
      { x: p.x + pad, y: p.y },
      { x: p.x, y: p.y + pad },
    ]
  }
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  return points.map(p => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad }
  })
}

export function closedPath(points: GeoPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]
    return `M${p.x},${p.y} m-40,0 a40,40 0 1,0 80,0 a40,40 0 1,0 -80,0`
  }
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  return `${d.join(' ')} Z`
}

export function landBlobFromProjected(points: GeoPoint[], pad = 70): string {
  if (points.length === 0) return ''
  const hull = convexHull(points)
  const fat = inflatePolygon(hull, pad)
  return closedPath(fat.length ? fat : hull)
}

export function ringsToPath(rings: Array<Array<[number, number]>>, box: GeoBox): string {
  return rings
    .map(ring => closedPath(ring.map(([lat, lon]) => projectLonLat(lat, lon, box))))
    .join(' ')
}

export function smoothPathThrough(points: GeoPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`
  }
  const parts = [`M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    parts.push(
      `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`,
    )
  }
  return parts.join(' ')
}

export function spreadProjected<T extends { x: number; y: number }>(
  points: T[],
  minDist = 78,
  rounds = 18,
  view?: { width: number; height: number },
  pad = 80,
): T[] {
  const out = points.map(p => ({ ...p }))
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dx = out[j].x - out[i].x
        const dy = out[j].y - out[i].y
        const d = Math.hypot(dx, dy) || 0.01
        if (d >= minDist) continue
        const push = (minDist - d) / 2
        const ux = dx / d
        const uy = dy / d
        out[i].x -= ux * push
        out[i].y -= uy * push
        out[j].x += ux * push
        out[j].y += uy * push
      }
    }
    if (view) {
      for (const p of out) {
        p.x = Math.min(view.width - pad, Math.max(pad, p.x))
        p.y = Math.min(view.height - pad, Math.max(pad, p.y))
      }
    }
  }
  return out
}

export interface OverviewLayout<T extends { coords: TripCoords }> {
  box: GeoBox
  packId?: string
  landD: string
  routeD: string
  labels: Array<GeoPoint & { text: string }>
  placed: Array<T & GeoPoint>
  chips: PlacedChip[]
  width: number
  height: number
}

export function layoutOverviewMap<T extends { coords: TripCoords; id: string; name: string }>(
  pois: T[],
  viewArg?: { width: number; height: number },
): OverviewLayout<T> {
  const view = viewArg ?? overviewViewBox(pois.length)
  const coords = pois.map(p => p.coords)
  const pack = matchingRegionPack(coords)
  const box = pack?.frame ?? boxFromCoords(coords)
  const raw = pois.map(p => {
    const pt = projectLonLat(p.coords.lat, p.coords.lon, box, view)
    return { ...p, ...pt }
  })
  const placed = spreadProjected(raw, 170, 28, view, 92)
  const landD = pack
    ? ringsToPath(pack.rings, box)
    : landBlobFromProjected(placed.map(p => ({ x: p.x, y: p.y })))
  const waterLabels = (pack?.labels ?? []).map(l => ({
    ...projectLonLat(l.lat, l.lon, box, view),
    text: l.text,
  }))
  const obstacles: Rect[] = waterLabels.map(l => ({
    x: l.x - 70,
    y: l.y - 14,
    w: 140,
    h: 22,
  }))
  obstacles.push({ x: 0, y: view.height - 88, w: view.width, h: 88 })
  const iconR = cssPxToView(30, view.width)
  const labelReach = iconR + cssPxToView(40, view.width)
  const chips = placeMapChips(
    placed.map(p => {
      const towardX = p.x < view.width / 2 ? -1 : 1
      const towardY = p.y < view.height / 2 ? -1 : 1
      const roomX = Math.min(p.x, view.width - p.x)
      const roomY = Math.min(p.y, view.height - p.y)
      const horizontal = roomX <= roomY
      return {
        id: p.id,
        ax: p.x,
        ay: p.y,
        text: shortMapLabel(p.name, 14),
        preferDx: horizontal ? towardX * labelReach : towardX * 18,
        preferDy: horizontal ? towardY * 18 : towardY * labelReach,
      }
    }),
    view,
    { iconR, gap: cssPxToView(8, view.width), obstacles },
  )
  return {
    box,
    packId: pack?.id,
    landD,
    routeD: smoothPathThrough(placed.map(p => ({ x: p.x, y: p.y }))),
    labels: waterLabels,
    placed,
    chips,
    width: view.width,
    height: view.height,
  }
}
