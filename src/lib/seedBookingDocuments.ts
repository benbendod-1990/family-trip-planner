// Canonical booking-reference cards that live on a seed trip without a PDF.
//
// Gmail sync is how e-tickets arrive, but a signed-in iPhone that can't reach
// Gmail (401 / expired refresh token) still needs to see the bookings we
// already know about — El Al PNRs, the Utopia sailing. These are link-only
// metadata: no invented PDFs. `path` is `external:<url>` so they round-trip
// through trip_documents without a schema change.
//
// Server-wins merge used to wipe anything not in trip_documents, which is why
// a seed (or a just-injected local card) vanished the moment cloud pull ran.

import type { TripDocument, TripPlan } from '@/types/trip-plan'

export const LINK_DOC_PREFIX = 'external:'

export function isLinkOnlyDocument(doc: Pick<TripDocument, 'path' | 'url'>): boolean {
  return Boolean(doc.url) || (doc.path?.startsWith(LINK_DOC_PREFIX) ?? false)
}

export function documentHref(doc: Pick<TripDocument, 'path' | 'url'>): string | null {
  if (doc.url) return doc.url
  if (doc.path?.startsWith(LINK_DOC_PREFIX)) return doc.path.slice(LINK_DOC_PREFIX.length)
  return null
}

export function encodeLinkPath(url: string): string {
  return `${LINK_DOC_PREFIX}${url}`
}

function mergeById(base: TripDocument[], extra: TripDocument[]): TripDocument[] {
  const ids = new Set(base.map(d => d.id))
  const out = [...base]
  for (const doc of extra) {
    if (ids.has(doc.id)) continue
    ids.add(doc.id)
    out.push(doc)
  }
  return out
}

/**
 * Server file-documents win; local link-only cards that the table doesn't
 * know about are kept. Without this, hydrateTrip's empty `documents: []`
 * erased the USA seed bookings on every sync.
 */
export function mergeServerDocuments(
  local: TripDocument[] | undefined,
  remote: TripDocument[] | undefined,
): TripDocument[] {
  const server = remote ?? []
  const localLinks = (local ?? []).filter(isLinkOnlyDocument)
  return mergeById(server, localLinks)
}

/** Fill in any canonical seed booking cards the live trip is still missing. */
export function ensureSeedBookingDocuments(trips: TripPlan[], seeds: TripPlan[]): TripPlan[] {
  return trips.map(t => {
    const seed = seeds.find(s => s.id === t.id)
    const seedDocs = (seed?.documents ?? []).filter(isLinkOnlyDocument)
    if (!seedDocs.length) return t
    const merged = mergeById(t.documents ?? [], seedDocs)
    if (merged.length === (t.documents ?? []).length) return t
    return { ...t, documents: merged }
  })
}
