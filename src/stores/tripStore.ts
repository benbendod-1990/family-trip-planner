import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TripPlan } from '@/types/trip-plan'
import type { TripEvent, TripDay } from '@/types/trip'
import type { BudgetItem } from '@/types/budget'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'
import type { FamilyMember } from '@/types/family'
import type { TripTask } from '@/types/task'
import type { PackingItem } from '@/types/packing'
import type { TripCoords } from '@/types/trip-plan'
import { generateId } from '@/utils/id'
import { getDaysBetween } from '@/utils/date'
import { DEMO_TRIP, DEMO_TRIPS } from '@/data/demoData'

interface TripStore {
  trips: TripPlan[]
  activeTripId: string | null

  setActiveTrip: (id: string | null) => void
  createTrip: (data: Omit<TripPlan, 'id' | 'tasks' | 'days' | 'budget' | 'accommodations' | 'flights' | 'createdAt' | 'updatedAt'>) => TripPlan
  updateTrip: (id: string, patch: Partial<TripPlan>) => void
  deleteTrip: (id: string) => void

  addEvent: (tripId: string, dayDate: string, event: Omit<TripEvent, 'id' | 'dayId'>) => void
  updateEvent: (tripId: string, eventId: string, patch: Partial<TripEvent>) => void
  removeEvent: (tripId: string, eventId: string) => void

  addExpense: (tripId: string, item: Omit<BudgetItem, 'id'>) => void
  updateExpense: (tripId: string, itemId: string, patch: Partial<BudgetItem>) => void
  removeExpense: (tripId: string, itemId: string) => void
  setBudget: (tripId: string, totalBudget: number, currency: string) => void

  addFlight: (tripId: string, flight: Omit<Flight, 'id'>) => void
  updateFlight: (tripId: string, flightId: string, patch: Partial<Flight>) => void
  removeFlight: (tripId: string, flightId: string) => void

  addAccommodation: (tripId: string, acc: Omit<Accommodation, 'id'>) => void
  updateAccommodation: (tripId: string, accId: string, patch: Partial<Accommodation>) => void
  removeAccommodation: (tripId: string, accId: string) => void

  addCarRental: (tripId: string, rental: Omit<CarRental, 'id'>) => void
  updateCarRental: (tripId: string, rentalId: string, patch: Partial<CarRental>) => void
  removeCarRental: (tripId: string, rentalId: string) => void

  addFamilyMember: (tripId: string, member: Omit<FamilyMember, 'id'>) => void
  updateFamilyMember: (tripId: string, memberId: string, patch: Partial<Omit<FamilyMember, 'id'>>) => void
  removeFamilyMember: (tripId: string, memberId: string) => void

  addTask: (tripId: string, task: Omit<TripTask, 'id' | 'done' | 'completedAt' | 'createdAt' | 'updatedAt'>) => void
  updateTask: (tripId: string, taskId: string, patch: Partial<Omit<TripTask, 'id' | 'createdAt'>>) => void
  toggleTask: (tripId: string, taskId: string) => void
  removeTask: (tripId: string, taskId: string) => void

  setCoords: (tripId: string, coords: TripCoords) => void

  addPackingItem: (tripId: string, item: Omit<PackingItem, 'id'>) => void
  updatePackingItem: (tripId: string, itemId: string, patch: Partial<Omit<PackingItem, 'id'>>) => void
  togglePackingItem: (tripId: string, itemId: string) => void
  removePackingItem: (tripId: string, itemId: string) => void
  addDefaultPackingItems: (tripId: string, items: Omit<PackingItem, 'id'>[]) => void
}

const buildDays = (startDate: string, endDate: string, existing: TripDay[] = []): TripDay[] => {
  const dates = getDaysBetween(startDate, endDate)
  return dates.map(date => {
    const found = existing.find(d => d.date === date)
    return found ?? { id: generateId(), date, events: [] }
  })
}

const touch = (trip: TripPlan): TripPlan => ({
  ...trip,
  updatedAt: new Date().toISOString(),
})

const updateTrip = (trips: TripPlan[], id: string, fn: (t: TripPlan) => TripPlan): TripPlan[] =>
  trips.map(t => (t.id === id ? fn(t) : t))

export const useTripStore = create<TripStore>()(
  persist(
    (set) => ({
      trips: [],
      activeTripId: null,

      setActiveTrip: (id) => set({ activeTripId: id }),

      createTrip: (data) => {
        const now = new Date().toISOString()
        const trip: TripPlan = {
          id: generateId(),
          ...data,
          tasks: [],
          days: buildDays(data.startDate, data.endDate),
          budget: { currency: 'ILS', totalBudget: 0, items: [] },
          accommodations: [],
          flights: [],
          carRentals: [],
          packingItems: [],
          createdAt: now,
          updatedAt: now,
        }
        set(state => ({ trips: [...state.trips, trip], activeTripId: trip.id }))
        return trip
      },

      updateTrip: (id, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, id, t => {
            const updated = touch({ ...t, ...patch })
            if ((patch.startDate || patch.endDate) && (patch.startDate !== t.startDate || patch.endDate !== t.endDate)) {
              updated.days = buildDays(updated.startDate, updated.endDate, t.days)
            }
            return updated
          }),
        })),

      deleteTrip: (id) =>
        set(state => ({
          trips: state.trips.filter(t => t.id !== id),
          activeTripId: state.activeTripId === id ? null : state.activeTripId,
        })),

      addEvent: (tripId, dayDate, event) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => {
            let day = t.days.find(d => d.date === dayDate)
            if (!day) {
              day = { id: generateId(), date: dayDate, events: [] }
            }
            const newEvent: TripEvent = { ...event, id: generateId(), dayId: day.id }
            const days = t.days.map(d =>
              d.date === dayDate ? { ...d, events: [...d.events, newEvent] } : d
            )
            return touch({ ...t, days })
          }),
        })),

      updateEvent: (tripId, eventId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => ({
            ...touch(t),
            days: t.days.map(d => ({
              ...d,
              events: d.events.map(e => (e.id === eventId ? { ...e, ...patch } : e)),
            })),
          })),
        })),

      removeEvent: (tripId, eventId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => ({
            ...touch(t),
            days: t.days.map(d => ({
              ...d,
              events: d.events.filter(e => e.id !== eventId),
            })),
          })),
        })),

      addExpense: (tripId, item) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            budget: { ...t.budget, items: [...t.budget.items, { ...item, id: generateId() }] },
          })),
        })),

      updateExpense: (tripId, itemId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            budget: {
              ...t.budget,
              items: t.budget.items.map(i => (i.id === itemId ? { ...i, ...patch } : i)),
            },
          })),
        })),

      removeExpense: (tripId, itemId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            budget: { ...t.budget, items: t.budget.items.filter(i => i.id !== itemId) },
          })),
        })),

      setBudget: (tripId, totalBudget, currency) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            budget: { ...t.budget, totalBudget, currency },
          })),
        })),

      addFlight: (tripId, flight) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            flights: [...t.flights, { ...flight, id: generateId() }],
          })),
        })),

      updateFlight: (tripId, flightId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            flights: t.flights.map(f => (f.id === flightId ? { ...f, ...patch } : f)),
          })),
        })),

      removeFlight: (tripId, flightId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            flights: t.flights.filter(f => f.id !== flightId),
          })),
        })),

      addAccommodation: (tripId, acc) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            accommodations: [...t.accommodations, { ...acc, id: generateId() }],
          })),
        })),

      updateAccommodation: (tripId, accId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            accommodations: t.accommodations.map(a => (a.id === accId ? { ...a, ...patch } : a)),
          })),
        })),

      removeAccommodation: (tripId, accId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            accommodations: t.accommodations.filter(a => a.id !== accId),
          })),
        })),

      addCarRental: (tripId, rental) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            carRentals: [...(t.carRentals ?? []), { ...rental, id: generateId() }],
          })),
        })),

      updateCarRental: (tripId, rentalId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            carRentals: (t.carRentals ?? []).map(r => (r.id === rentalId ? { ...r, ...patch } : r)),
          })),
        })),

      removeCarRental: (tripId, rentalId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            carRentals: (t.carRentals ?? []).filter(r => r.id !== rentalId),
          })),
        })),

      addFamilyMember: (tripId, member) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            family: [...t.family, { ...member, id: generateId() }],
          })),
        })),

      updateFamilyMember: (tripId, memberId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            family: t.family.map(m => (m.id === memberId ? { ...m, ...patch } : m)),
          })),
        })),

      removeFamilyMember: (tripId, memberId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            family: t.family.filter(m => m.id !== memberId),
            tasks: (t.tasks ?? []).map(task => (task.assignedTo === memberId ? { ...task, assignedTo: undefined } : task)),
            budget: {
              ...t.budget,
              items: t.budget.items.map(item => (item.paidBy === memberId ? { ...item, paidBy: undefined } : item)),
            },
          })),
        })),

      addTask: (tripId, task) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => {
            const now = new Date().toISOString()
            const newTask: TripTask = {
              id: generateId(),
              title: task.title,
              description: task.description || undefined,
              dueDate: task.dueDate || undefined,
              assignedTo: task.assignedTo || undefined,
              done: false,
              createdAt: now,
              updatedAt: now,
            }
            return touch({ ...t, tasks: [...(t.tasks ?? []), newTask] })
          }),
        })),

      updateTask: (tripId, taskId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => {
            const now = new Date().toISOString()
            const tasks = (t.tasks ?? []).map(task => {
              if (task.id !== taskId) return task
              const nextDone = patch.done ?? task.done
              const completedAt = nextDone ? (patch.completedAt ?? task.completedAt ?? now) : undefined
              return {
                ...task,
                ...patch,
                done: nextDone,
                completedAt,
                updatedAt: now,
              }
            })
            return touch({ ...t, tasks })
          }),
        })),

      toggleTask: (tripId, taskId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => {
            const now = new Date().toISOString()
            const tasks = (t.tasks ?? []).map(task => {
              if (task.id !== taskId) return task
              const nextDone = !task.done
              return {
                ...task,
                done: nextDone,
                completedAt: nextDone ? now : undefined,
                updatedAt: now,
              }
            })
            return touch({ ...t, tasks })
          }),
        })),

      removeTask: (tripId, taskId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            tasks: (t.tasks ?? []).filter(task => task.id !== taskId),
          })),
        })),

      setCoords: (tripId, coords) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => ({ ...t, coords })),
        })),

      addPackingItem: (tripId, item) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            packingItems: [...(t.packingItems ?? []), { ...item, id: generateId() }],
          })),
        })),

      updatePackingItem: (tripId, itemId, patch) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            packingItems: (t.packingItems ?? []).map(i => (i.id === itemId ? { ...i, ...patch } : i)),
          })),
        })),

      togglePackingItem: (tripId, itemId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            packingItems: (t.packingItems ?? []).map(i => (i.id === itemId ? { ...i, packed: !i.packed } : i)),
          })),
        })),

      removePackingItem: (tripId, itemId) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            packingItems: (t.packingItems ?? []).filter(i => i.id !== itemId),
          })),
        })),

      addDefaultPackingItems: (tripId, items) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({
            ...t,
            packingItems: [
              ...(t.packingItems ?? []),
              ...items.map(item => ({ ...item, id: generateId() })),
            ],
          })),
        })),
    }),
    {
      name: 'myk-trip-plan-store',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return

        // One-shot migration: drop the legacy non-UUID Italy demo. Its IDs
        // don't match the Supabase schema (uuid columns), so syncs to cloud
        // silently fail. Replace it with the real upcoming trip.
        const onlyItalyDemo =
          state.trips.length === 1 && state.trips[0]?.id === 'demo-italy-2026'
        if (state.trips.length === 0 || onlyItalyDemo) {
          state.trips = [...DEMO_TRIPS]
          state.activeTripId = DEMO_TRIP.id
          return
        }

        // Seed any known upcoming trips that aren't in the store yet (idempotent
        // by trip id). Lets us ship new sample trips without resetting localStorage.
        const haveIds = new Set(state.trips.map(t => t.id))
        const missingDemos = DEMO_TRIPS.filter(t => !haveIds.has(t.id))
        if (missingDemos.length) {
          state.trips = [...state.trips, ...missingDemos]
        }

        // One-shot: replace stale Holland trip (start 20.8) with refreshed seed
        // (start 18.8, full doc-sourced itinerary). Detect by id + old startDate.
        const HOLLAND_ID = '34980c90-bd66-4270-8d45-3e96787b07ef'
        const freshHolland = DEMO_TRIPS.find(t => t.id === HOLLAND_ID)
        if (freshHolland) {
          state.trips = state.trips.map(t =>
            t.id === HOLLAND_ID && t.startDate === '2026-08-20' ? freshHolland : t
          )
        }

        state.trips = state.trips.map(t => ({
          ...t,
          tasks: t.tasks ?? [],
          packingItems: t.packingItems ?? [],
          carRentals: t.carRentals ?? [],
        }))
      },
    }
  )
)

// Selectors
export const selectActiveTrip = (state: TripStore): TripPlan | undefined =>
  state.trips.find(t => t.id === state.activeTripId)

export const getTotalSpent = (trip: TripPlan): number =>
  trip.budget.items.reduce((s, i) => s + (i.actual ?? 0), 0)

export const getTotalPlanned = (trip: TripPlan): number =>
  trip.budget.items.reduce((s, i) => s + i.planned, 0)

export const getBudgetByCategory = (trip: TripPlan) =>
  trip.budget.items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = { planned: 0, actual: 0 }
      acc[item.category].planned += item.planned
      acc[item.category].actual += item.actual ?? 0
      return acc
    },
    {} as Record<string, { planned: number; actual: number }>
  )
