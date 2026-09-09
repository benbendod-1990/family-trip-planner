/**
 * Linked Google Doc URL/title for canonical seed trips.
 *
 * `hydrateTrip` has no `doc_url` column on live `public.trips` (until
 * migration 0010). A signed-in member whose USA trip arrives only from
 * cloud therefore gets a plan with no `docUrl`, and Trip Doc hides the
 * open/read controls. PR #8 kept a local copy when one side still had it;
 * that fails for an invitee (empty per-account persist) and for a realtime
 * refetch that already wiped the field.
 *
 * Header-only map — do not import the seed JSON here (that would pull the
 * itinerary into the supabase chunk). Keep in sync with src/data/*-trip.json.
 */

export const USA_TRIP_ID = 'b38fc010-9096-45c9-b8df-191e369143dc'
export const HOLLAND_TRIP_ID = '34980c90-bd66-4270-8d45-3e96787b07ef'

export const USA_PLANNING_DOC_URL =
  'https://docs.google.com/document/d/1gAabX9m9vWPLBjvQZszXpEh5_rCJWC6dArhMe8E8aGo/edit'
export const USA_PLANNING_DOC_TITLE = '★ ארה״ב 2027 — תכנון קבוצה'

export const HOLLAND_PLANNING_DOC_URL =
  'https://docs.google.com/document/d/1H22xt-Q6VrHNQ4PMvF0UvSw7K5XBvVc5VzZgfyEeyjc/edit?tab=t.0'

export const CANONICAL_SEED_DOC_LINKS: Record<string, { docUrl: string; docTitle?: string }> = {
  [HOLLAND_TRIP_ID]: { docUrl: HOLLAND_PLANNING_DOC_URL },
  [USA_TRIP_ID]: { docUrl: USA_PLANNING_DOC_URL, docTitle: USA_PLANNING_DOC_TITLE },
}

export function resolveDocLink(
  tripId: string,
  existing?: { docUrl?: string; docTitle?: string },
): { docUrl?: string; docTitle?: string } {
  const seed = CANONICAL_SEED_DOC_LINKS[tripId]
  const docUrl = existing?.docUrl || seed?.docUrl
  const docTitle = existing?.docTitle || seed?.docTitle
  return { docUrl, docTitle }
}

/** Fill docUrl/docTitle from the matching seed when the live trip is missing them. */
export function applyCanonicalSeedDocLink<T extends { id: string; docUrl?: string; docTitle?: string }>(
  trip: T,
): T {
  const next = resolveDocLink(trip.id, { docUrl: trip.docUrl, docTitle: trip.docTitle })
  if (next.docUrl === trip.docUrl && next.docTitle === trip.docTitle) return trip
  return { ...trip, ...next }
}

export function ensureSeedDocLinks<T extends { id: string; docUrl?: string; docTitle?: string }>(
  trips: T[],
): T[] {
  let changed = false
  const out = trips.map(t => {
    const next = applyCanonicalSeedDocLink(t)
    if (next !== t) changed = true
    return next
  })
  return changed ? out : trips
}

/**
 * Cloud `trips` row → doc fields. Reads `doc_url` / `doc_title` when the
 * columns exist; otherwise falls back to the canonical seed for that id.
 */
export function docLinkFromCloudRow(row: Record<string, unknown>): { docUrl?: string; docTitle?: string } {
  const id = typeof row.id === 'string' ? row.id : ''
  return resolveDocLink(id, {
    docUrl: typeof row.doc_url === 'string' && row.doc_url ? row.doc_url : undefined,
    docTitle: typeof row.doc_title === 'string' && row.doc_title ? row.doc_title : undefined,
  })
}

