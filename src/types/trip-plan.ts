import type { TripDay } from './trip'
import type { Budget } from './budget'
import type { Accommodation, CarRental, Flight } from './accommodation'
import type { FamilyMember, ID } from './family'
import type { TripTask } from './task'
import type { PackingItem } from './packing'

export interface TripCoords {
  lat: number
  lon: number
}

/**
 * A travel document — an e-ticket, voucher or booking PDF. The file itself
 * lives in the `trip-documents` Storage bucket and this metadata in the
 * `trip_documents` table, read and written on its own rather than through
 * save_trip() — which has no documents key and used to drop them. See
 * migration 0007.
 */
export interface TripDocument {
  id: ID
  /** Object key in the bucket: `<tripId>/<id>-<filename>`. */
  path: string
  filename: string
  mimeType: string
  /** Bytes, for showing size and refusing oversized attachments. */
  size: number
  /**
   * SHA-256 of the bytes. The dedup key: the same e-ticket reaches us from the
   * airline and again from a forward, under two message ids and often two
   * filenames, but the bytes are identical.
   */
  sha256?: string
  /**
   * Public booking-management URL for a link-only entry (no PDF in Storage).
   * Encoded on the row as `path: "external:<url>"` so it survives without a
   * schema change. Prefer `documentHref()` over reading this directly.
   */
  url?: string
  /** Set when the document was pulled automatically out of Gmail. */
  sourceMessageId?: string
  sourceSubject?: string
  sourceFrom?: string
  /** Date of the source email, or of the upload. */
  addedAt: string
  kind: 'flight' | 'hotel' | 'car' | 'activity' | 'other'
}

export interface TripPlan {
  id: ID
  name: string
  destination: string
  startDate: string
  endDate: string
  coverEmoji: string
  family: FamilyMember[]
  tasks: TripTask[]
  days: TripDay[]
  budget: Budget
  accommodations: Accommodation[]
  flights: Flight[]
  carRentals: CarRental[]
  packingItems: PackingItem[]
  coords?: TripCoords
  /** Linked Google Doc — the source of truth for this trip's plan. */
  docUrl?: string
  /** When the seed/app content was last reconciled against docUrl. */
  docLastPulledAt?: string
  /** Travel documents pulled from Gmail attachments or uploaded by hand. */
  documents?: TripDocument[]
  createdAt: string
  updatedAt: string
}
