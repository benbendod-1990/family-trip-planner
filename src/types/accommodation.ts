import type { ID } from './family'

export type AccommodationType = 'hotel' | 'airbnb' | 'hostel' | 'villa' | 'other'
export type CabinClass = 'economy' | 'business' | 'first'
export type CarCategory = 'economy' | 'compact' | 'midsize' | 'full-size' | 'suv' | 'van' | 'luxury'

export interface Accommodation {
  id: ID
  name: string
  type: AccommodationType
  address?: string
  checkIn: string
  checkOut: string
  cost: number
  currency: string
  confirmationNumber?: string
  notes?: string
  rating?: number
}

export interface CarRental {
  id: ID
  company: string
  carModel?: string
  carCategory: CarCategory
  pickupLocation: string
  dropoffLocation?: string
  pickupDate: string
  dropoffDate: string
  cost: number
  currency: string
  confirmationNumber?: string
  driverName?: string
  includesInsurance?: boolean
  notes?: string
}

export interface Flight {
  id: ID
  airline: string
  flightNumber: string
  departureAirport: string
  arrivalAirport: string
  departureTime: string
  arrivalTime: string
  cost: number
  currency: string
  direction: 'outbound' | 'return'
  cabinClass: CabinClass
  confirmationNumber?: string
  baggageIncluded?: boolean
  ticketUrl?: string
}
