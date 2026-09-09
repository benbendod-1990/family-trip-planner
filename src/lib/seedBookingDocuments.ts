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

/** Combined 3-card USA placeholders from the first seed pass — replaced by Dorit's Gmail ids. */
export const STALE_USA_SEED_DOC_IDS = new Set([
  'c38fc010-9096-45c9-b8df-191e369143d1',
  'c38fc010-9096-45c9-b8df-191e369143d2',
  'c38fc010-9096-45c9-b8df-191e369143d3',
])

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

/**
 * When Gmail finally yields the real PDF, drop the matching placeholder so we
 * don't keep a link-only card next to the file. Match on message id or thread
 * id — not filename, because two Utopia receipts share Cruise_Vacation_Receipt.pdf.
 */
export function findGmailPlaceholder(
  docs: TripDocument[],
  msg: { id: string; threadId?: string },
): TripDocument | undefined {
  const keys = [msg.id, msg.threadId].filter((k): k is string => Boolean(k))
  if (!keys.length) return undefined
  return docs.find(
    d => isLinkOnlyDocument(d) && d.sourceMessageId && keys.includes(d.sourceMessageId),
  )
}

/** Fill in any canonical seed booking cards the live trip is still missing. */
export function ensureSeedBookingDocuments(trips: TripPlan[], seeds: TripPlan[]): TripPlan[] {
  return trips.map(t => {
    const seed = seeds.find(s => s.id === t.id)
    const seedDocs = (seed?.documents ?? []).filter(isLinkOnlyDocument)
    if (!seedDocs.length && !(t.documents ?? []).some(d => STALE_USA_SEED_DOC_IDS.has(d.id))) {
      return t
    }
    const kept = (t.documents ?? []).filter(d => !STALE_USA_SEED_DOC_IDS.has(d.id))
    const haveId = new Set(kept.map(d => d.id))
    const haveGmail = new Set(kept.map(d => d.sourceMessageId).filter(Boolean) as string[])
    const missing = seedDocs.filter(d => {
      if (haveId.has(d.id)) return false
      if (d.sourceMessageId && haveGmail.has(d.sourceMessageId)) return false
      return true
    })
    const merged = [...kept, ...missing]
    if (
      merged.length === (t.documents ?? []).length &&
      merged.every((d, i) => d.id === (t.documents ?? [])[i]?.id)
    ) {
      return t
    }
    return { ...t, documents: merged }
  })
}
