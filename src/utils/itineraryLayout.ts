/**
 * Column count for the itinerary day grid.
 *
 * Do NOT use CSS `repeat(auto-fit, minmax(280px, 1fr))` here. That template
 * inside AppShell's flex `main` (min-width: auto) sizes to N×280px of
 * min-content. A 15-day trip (USA) is 4200px; the parent is ~viewport-wide
 * with overflow-x: hidden, and the layout engine can loop until the tab
 * freezes. Shorter trips (Rome, 6 days) often stabilize. Home/Budget already
 * use a definite 1/2/3 column count — same rule here.
 */
export function itineraryGridColumns(isMobile: boolean, isTablet: boolean): number {
  if (isMobile) return 1
  if (isTablet) return 2
  return 3
}
