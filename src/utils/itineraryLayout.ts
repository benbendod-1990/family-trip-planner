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
 * min-content (Timeline rows, nowrap map links). WebKit will then paint a
 * cream blank — AppShell + html overflow-x:hidden clip the overflow, and
 * the first paint of itinerary never lands. Use `minmax(0, 1fr)`, and on
 * a single column skip grid entirely (flex stack).
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
