// Deep links into Waze / Google Maps. Both target the universal-link form
// (https://waze.com/ul, google.com/maps) which opens the native app on iOS/Android
// when installed, falling back to web otherwise.
//
// Quality of these links is bottlenecked by the precision of the address text:
// Waze treats "Kaatsheuvel, Netherlands" as the city centroid, so a hotel address
// must include street + number to actually navigate to the door. Prefer coords
// when available — they bypass geocoding entirely.

export interface MapTarget {
  address?: string
  lat?: number
  lng?: number
  label?: string
}

function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function toTarget(input: string | MapTarget): MapTarget {
  return typeof input === 'string' ? { address: input } : input
}

export function wazeUrl(input: string | MapTarget): string {
  const t = toTarget(input)
  if (isFiniteCoord(t.lat) && isFiniteCoord(t.lng)) {
    // ll= bypasses geocoding — opens Waze pinned exactly on the coords.
    return `https://waze.com/ul?ll=${t.lat}%2C${t.lng}&navigate=yes&zoom=17`
  }
  const q = (t.address ?? t.label ?? '').trim()
  if (!q) return 'https://waze.com'
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`
}

export function googleMapsUrl(input: string | MapTarget): string {
  const t = toTarget(input)
  if (isFiniteCoord(t.lat) && isFiniteCoord(t.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${t.lat}%2C${t.lng}`
  }
  const q = (t.address ?? t.label ?? '').trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

// A flight leg, written as an IATA pair: "Aegean A3624 ATH→AMS". The landing
// event that starts a day on the ground ("🛬 נחיתה בסכיפהול + איסוף רכב") has
// no such pair, which is exactly the line we want to draw: Schiphol is a real
// first stop of the driving day, Tel Aviv → Athens is not.
const FLIGHT_LEG = /\b[A-Z]{3}\s*(?:→|->)\s*[A-Z]{3}\b/

export interface RouteStopSource {
  title?: string
  location?: string
}

/**
 * The stops a day's driving route should actually pass through: located events
 * in order, minus flight legs, minus consecutive repeats of the same place
 * (staying at the resort all day shouldn't add the resort three times).
 */
export function routeStopsForDay(events: RouteStopSource[]): string[] {
  const stops: string[] = []
  for (const e of events) {
    const loc = e.location?.trim()
    if (!loc) continue
    if (FLIGHT_LEG.test(e.title ?? '')) continue
    if (stops[stops.length - 1] === loc) continue
    stops.push(loc)
  }
  return stops
}

// One connected Google Maps directions link through every stop, in order. The
// /maps/dir/A/B/C form opens the native Maps app on mobile and lets Google
// geocode each stop itself — so plain address strings work, no coords needed.
export function googleMapsRouteUrl(stops: Array<string | MapTarget>): string {
  const path = stops
    .map(s => {
      const t = toTarget(s)
      if (isFiniteCoord(t.lat) && isFiniteCoord(t.lng)) return `${t.lat},${t.lng}`
      return encodeURIComponent((t.address ?? t.label ?? '').trim())
    })
    .filter(Boolean)
    .join('/')
  return `https://www.google.com/maps/dir/${path}`
}
