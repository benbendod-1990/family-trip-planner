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
