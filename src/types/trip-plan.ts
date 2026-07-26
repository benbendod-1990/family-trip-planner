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
  createdAt: string
  updatedAt: string
}
