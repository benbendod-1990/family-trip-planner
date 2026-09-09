import { catalogEntryForKey } from './placeCatalog.ts'
import { canonicalPlaceKey, isSkippableMapLocation } from './tripMapPois.ts'
import type { TripDay, TripEvent } from '../types/trip.ts'
import type { TripPlan } from '../types/trip-plan.ts'

export interface SegmentItem {
  emoji: string
  text: string
  poiKey?: string
}

export interface TripSegment {
  id: string
  index: number
  startDate: string
  endDate: string
  title: string
  hubKey?: string
  items: SegmentItem[]
  dayIds: string[]
}

interface AccLike {
  id: string
  name: string
  checkIn: string
  checkOut: string
}

function coveringStay(date: string, accs: AccLike[]): AccLike | undefined {
  const overnight = accs.find(a => a.checkIn <= date && a.checkOut > date)
  if (overnight) return overnight
  return accs.find(a => a.checkIn === date)
}

function stripEmoji(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+/u, '').trim() || title
}

function eventEmoji(title: string): string {
  const m = title.match(/\p{Extended_Pictographic}/u)
  return m ? m[0] : '•'
}

function itemFromEvent(event: TripEvent): SegmentItem | null {
  const text = stripEmoji(event.title)
  if (!text) return null
  const loc = event.location?.trim()
  const poiKey = loc && !isSkippableMapLocation(loc) ? canonicalPlaceKey(loc) : undefined
  return { emoji: eventEmoji(event.title), text, poiKey }
}

function shortStayName(name: string): string {
  return name.split(/[/(—–]| · /)[0]?.trim() || name
}

function segmentTitle(days: TripDay[], stay: AccLike | undefined): string {
  if (stay) {
    const key = canonicalPlaceKey(stay.name)
    return catalogEntryForKey(key)?.nameHe ?? shortStayName(stay.name)
  }
  const labels = [...new Set(days.map(d => d.label?.trim()).filter(Boolean))] as string[]
  if (labels.length === 1) return labels[0]
  if (labels.length > 1) return labels[0]
  const loc = days.flatMap(d => d.events ?? []).map(e => e.location?.trim()).find(Boolean)
  return loc || 'מקטע בטיול'
}

function uniqueItems(days: TripDay[], max = 6): SegmentItem[] {
  const seen = new Set<string>()
  const items: SegmentItem[] = []
  for (const day of days) {
    for (const event of day.events ?? []) {
      const item = itemFromEvent(event)
      if (!item) continue
      const key = item.text.replace(/\s+/g, ' ').toLowerCase()
      if (seen.has(key)) continue
      if (/^tbd\b/i.test(item.text) && items.length >= 2) continue
      seen.add(key)
      items.push(item)
      if (items.length >= max) return items
    }
  }
  return items
}

/**
 * Group consecutive days that share an overnight stay. Checkout/check-in
 * overlap days follow the new stay. Leftover days (flights home) group together.
 */
export function deriveTripSegments(
  trip: Pick<TripPlan, 'days' | 'accommodations'>,
): TripSegment[] {
  const days = [...(trip.days ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const accs = (trip.accommodations ?? []) as AccLike[]
  const groups: Array<{ stay?: AccLike; days: TripDay[] }> = []

  for (const day of days) {
    const stay = coveringStay(day.date, accs)
    const last = groups[groups.length - 1]
    const same = last && (last.stay?.id ?? '') === (stay?.id ?? '')
    if (same && last) last.days.push(day)
    else groups.push({ stay, days: [day] })
  }

  return groups.map((g, index) => {
    const startDate = g.days[0].date
    const endDate = g.days[g.days.length - 1].date
    const hubKey = g.stay ? canonicalPlaceKey(g.stay.name) : undefined
    return {
      id: `seg:${startDate}:${endDate}:${index}`,
      index: index + 1,
      startDate,
      endDate,
      title: segmentTitle(g.days, g.stay),
      hubKey,
      items: uniqueItems(g.days),
      dayIds: g.days.map(d => d.id),
    }
  })
}

export function flowPillsFromDays(days: TripDay[]): string[] {
  const pills: string[] = []
  const seen = new Set<string>()
  for (const day of days) {
    const label = (day.label ?? '').trim()
    if (!label) continue
    const short = label
      .replace(/^TBD\s*[—–-]\s*/i, '')
      .replace(/\s+/g, ' ')
    const key = short.toLocaleLowerCase('he')
    if (seen.has(key)) continue
    seen.add(key)
    pills.push(short)
  }
  return pills
}
