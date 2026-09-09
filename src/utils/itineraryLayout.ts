/**
 * Column count for the itinerary day list.
 *
 * Do NOT use CSS `repeat(auto-fit, minmax(280px, 1fr))` here. That template
 * inside AppShell's flex `main` (min-width: auto) sizes to N×280px of
 * min-content. A 15-day trip (USA) is 4200px; the parent is ~viewport-wide
 * with overflow-x: hidden, and the layout engine can loop until the tab
 * freezes. Shorter trips (Rome, 6 days) often stabilize.
 *
 * A definite column count is necessary but not sufficient: CSS `1fr` is
 * `minmax(auto, 1fr)`, so the column still refuses to shrink below
 * min-content (event rows, nowrap map links). WebKit will then paint a
 * cream blank — AppShell + html overflow-x:hidden clip the overflow, and
 * the first paint of itinerary never lands. Use `minmax(0, 1fr)`, and on
 * a single column skip grid entirely (flex stack). Day columns use a local
 * event list rather than myk-library Timeline for the same reason.
 */
export function itineraryGridColumns(isMobile: boolean, isTablet: boolean): number {
  if (isMobile) return 1
  if (isTablet) return 2
  return 3
}

/** Grid track list that can shrink inside a flex parent. */
export function itineraryDaysTemplate(columns: number): string {
  return `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`
}

/** One column: flex stack, no grid. Wider: the minmax(0, 1fr) template. */
export function itineraryIsSingleColumn(columns: number): boolean {
  return columns <= 1
}

/**
 * Sort a day's events by startTime without throwing.
 *
 * `[...day.events].sort((a, b) => a.startTime.localeCompare(b.startTime))`
 * throws when `events` is missing, or when `startTime` is missing *and* the
 * engine uses that event as `this` (WebKit's sort does; V8 TimSort often
 * does not — so Chromium can paint while iPhone hits PageErrorBoundary).
 */
export function sortDayEvents<T extends { startTime?: string }>(events: T[] | null | undefined): T[] {
  const list = Array.isArray(events) ? events.slice() : []
  list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  return list
}

/** Star string that never calls String.repeat with a non-integer / negative. */
export function ratingStars(rating: unknown): string {
  const n = Number(rating)
  if (!Number.isFinite(n) || n <= 0) return ''
  return '⭐'.repeat(Math.min(5, Math.max(0, Math.round(n))))
}
