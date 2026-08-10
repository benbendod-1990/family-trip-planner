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
 * lives in the `trip-documents` Storage bucket; this metadata rides inside the
 * trip so it syncs to both phones with everything else.
 */
export interface TripDocument {
  id: ID
  /** Object key in the bucket: `<tripId>/<id>-<filename>`. */
  path: string
  filename: string
  mimeType: string
  /** Bytes, for showing size and refusing oversized attachments. */
  size: number
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
