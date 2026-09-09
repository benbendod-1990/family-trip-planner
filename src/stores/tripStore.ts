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
import { normalizeSeedTimestamp } from '@/lib/seedNormalize'
import {
  loadSeedDuplicateRedirects,
  saveSeedDuplicateRedirects,
} from '@/lib/dedupeDemoTrips'
import { ensureSeedBookingDocuments } from '@/lib/seedBookingDocuments'
import { ensureSeedDocLinks } from '@/lib/seedDocLink'
import { hydrateGuestTrips } from '@/lib/authTripSync'
import {
  getTripStoreAccount,
  initTripStoreAccountFromHint,
  isGuestTripStore,
  persistHasEntry,
  planTripStoreAccountSwitch,
  setTripStoreAccount,
  tripStorePersistName,
} from '@/lib/tripStoreScope'

const initialTripStoreAccount = initTripStoreAccountFromHint()

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
  setDocUrl: (tripId: string, docUrl: string) => void
  markDocChecked: (tripId: string, at: string) => void
  setEventCoords: (tripId: string, eventId: string, coords: TripCoords) => void
  setAccommodationCoords: (tripId: string, accId: string, coords: TripCoords) => void

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

      // The linked Doc is shared trip content — both spouses should see it, so
      // this one does touch.
      setDocUrl: (tripId, docUrl) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => touch({ ...t, docUrl })),
        })),

      // Bypass `touch`: "I checked the Doc" is per-device bookkeeping, not a
      // change to the plan. Touching here would let a read-only check win the
      // newer-wins merge over the other device's real edits.
      markDocChecked: (tripId, at) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => ({ ...t, docLastPulledAt: at })),
        })),

      // Bypass `touch` — pure geocode hydration shouldn't bump updatedAt and trigger cloud sync.
      setEventCoords: (tripId, eventId, coords) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => ({
            ...t,
            days: t.days.map(d => ({
              ...d,
              events: d.events.map(e => (e.id === eventId ? { ...e, coords } : e)),
            })),
          })),
        })),

      setAccommodationCoords: (tripId, accId, coords) =>
        set(state => ({
          trips: updateTrip(state.trips, tripId, t => ({
            ...t,
            accommodations: t.accommodations.map(a =>
              a.id === accId ? { ...a, coords } : a
            ),
          })),
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
      name: tripStorePersistName(initialTripStoreAccount),
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return

        // Demo seeds are a guest catalog only. An authenticated cache must
        // not grow Holland/Paris/Crete/Rome just because those UUIDs are
        // missing — membership comes from Supabase RLS after wireUp.
        if (isGuestTripStore()) {
          const injected = hydrateGuestTrips(
            state.trips,
            DEMO_TRIPS,
            loadSeedDuplicateRedirects(),
          )
          state.trips = injected.trips
          saveSeedDuplicateRedirects(injected.redirects)
          if (injected.replacedCatalog) {
            state.activeTripId = DEMO_TRIP.id
            return
          }
          if (state.activeTripId && injected.droppedIds.includes(state.activeTripId)) {
            const target = injected.redirects[state.activeTripId]
            state.activeTripId =
              (target && state.trips.some(t => t.id === target) ? target : null) ??
              state.trips[0]?.id ??
              null
          }
        }

        // One-shot: replace stale Holland trip with refreshed seed (start 18.8,
        // full doc-sourced itinerary, SKY express return flight). Detect stale
        // copy by content markers — old startDate, leftover easyJet flight, or
        // empty itinerary — so users on any historical version get refreshed.
        const HOLLAND_ID = '34980c90-bd66-4270-8d45-3e96787b07ef'
        const freshHolland = DEMO_TRIPS.find(t => t.id === HOLLAND_ID)
        if (freshHolland) {
          state.trips = state.trips.map(t => {
            if (t.id !== HOLLAND_ID) return t
            const hasEasyJet = (t.flights ?? []).some(f =>
              /easyjet|EJU/i.test(`${f.airline ?? ''} ${f.flightNumber ?? ''}`)
            )
            const isEmptyItinerary = (t.days ?? []).every(d => (d.events ?? []).length === 0)
            const oldStart = t.startDate === '2026-08-20'
            // Flight times stored as UTC (Z-suffixed) shift +3h on display in
            // Israel TZ — they should be stored as local airport time (no Z).
            const hasUtcFlightTimes = (t.flights ?? []).some(f =>
              (f.departureTime ?? '').endsWith('Z') || (f.arrivalTime ?? '').endsWith('Z')
            )
            // Content marker for the itinerary overhaul that came from the
            // Google Doc (source of truth). These places were dropped from the
            // plan, so their presence proves the live copy predates the current
            // Doc. The refreshed seed carries none of them, so this is
            // self-limiting — it can't fire twice.
            const hasOldItinerary = (t.days ?? []).some(d =>
              (d.events ?? []).some(e =>
                /Julianatoren|Plaswijckpark|Pukkemuk|Binnendieze|Docus|Loonse/i.test(
                  `${e.title ?? ''} ${e.location ?? ''}`
                )
              )
            )
            // Content marker for the day-route fix: the refreshed seed fills in
            // the locations that 19.8 (Efteling) and 27.8 (departure) were
            // missing, without which those days can't draw a Google Maps route.
            // A live copy where either still has fewer than two located events
            // predates it — and after the swap both have three or more, so this
            // can't fire twice.
            const missingRouteStops = (t.days ?? []).some(
              d =>
                (d.date === '2026-08-19' || d.date === '2026-08-27') &&
                (d.events ?? []).filter(e => e.location).length < 2
            )
            // Content marker for the park-days rework. An earlier version of
            // this moved Toverland to Friday 21.8 to dodge the Saturday crowds,
            // before the tickets turned up in Gmail — already bought, dated,
            // and non-transferable except for medical reasons. The visit is
            // back on 22.8, so any live copy showing Toverland on 21.8 came
            // from that short-lived version and needs pulling back. The seed
            // now has Toverland on 22.8, so this can't fire twice.
            const hasFridayToverland = (t.days ?? []).some(
              d =>
                d.date === '2026-08-21' &&
                (d.events ?? []).some(e =>
                  /Toverland/i.test(`${e.title ?? ''} ${e.location ?? ''}`)
                )
            )
            // Content marker for the Beekse Bergen rework. The old plan sent
            // them on a bus safari on 25.8, but that safari is seasonal and
            // runs 1.10–31.3 — it does not exist in August, so any live copy
            // still showing it is stale. The refreshed seed replaces it with
            // the Gamedrive and never mentions a bus safari, so this can't
            // fire twice.
            const hasAugustBusSafari = (t.days ?? []).some(d =>
              (d.events ?? []).some(e => /ספארי אוטובוס/.test(e.title ?? ''))
            )
            // The 20–27.8 lodging has been recorded under two wrong names now.
            // It was "Lake Resort Beekse Bergen", then got renamed to "Safari
            // Resort" — both wrong. The Gamedrive confirmation (382911) and
            // every mail from Libéma say Safari *Hotel*, and the booked room
            // type settles it: a Savanne Room is a Safari Hotel room. Both old
            // names therefore mark a stale copy, and the seed carries neither.
            const WRONG_RESORT = /(Lake|Safari) Resort Beekse Bergen/i
            const hasWrongResort =
              (t.accommodations ?? []).some(a => WRONG_RESORT.test(a.name ?? '')) ||
              (t.days ?? []).some(d =>
                (d.events ?? []).some(e => WRONG_RESORT.test(e.location ?? ''))
              )
            // Content marker for the 19.8 Efteling route fix: Pagode was added
            // to the Reizenrijk block (enclosed + seated, and the plan already
            // stands on that square), Tufferbaan/Kinderspoor folded into the
            // Anton Pieckplein block, and Nest! pulled back to 20:25 because
            // Ruigrijk -> Aquanura isn't the 5 minutes the old plan assumed.
            // A 19.8 with no Pagode predates it; the seed now has one, so this
            // can't fire twice.
            const missingEftelingPagode = (t.days ?? []).some(
              d =>
                d.date === '2026-08-19' &&
                (d.events ?? []).length > 0 &&
                !(d.events ?? []).some(e => /Pagode/i.test(e.title ?? ''))
            )
            // Content marker for the resort-days meal rework. The old plan sent
            // them to "De Pannenkoekenbakker" in Hilvarenbeek — which does not
            // exist, the chain's nearest branch (Tilburg) closed in July 2025 —
            // and to "MottoToko", which is not a venue at all but a conflation
            // of restaurant Moto and the Karibu Town sandwich counter. Either
            // name proves the live copy predates the rework; the seed now names
            // real places and carries neither, so this can't fire twice.
            const hasPhantomMeals = (t.days ?? []).some(d =>
              (d.events ?? []).some(e =>
                /Pannenkoekenbakker|MottoToko/i.test(`${e.title ?? ''} ${e.location ?? ''}`)
              )
            )
            // A fundamentally broken copy (wrong flight, wrong dates) predates
            // the good baseline — replace the whole trip.
            const isBroken = hasEasyJet || isEmptyItinerary || oldStart || hasUtcFlightTimes
            const now = new Date().toISOString()
            if (isBroken) return { ...freshHolland, updatedAt: now }
            // Rename the booking in place rather than replacing it: the row
            // carries the real confirmation number and price, which the seed
            // shouldn't overwrite.
            const accommodations = hasWrongResort
              ? (t.accommodations ?? []).map(a =>
                  WRONG_RESORT.test(a.name ?? '')
                    ? { ...a, name: 'Safari Hotel Beekse Bergen' }
                    : a
                )
              : t.accommodations
            // Otherwise only the itinerary changed: swap just the days, keeping
            // the user's own tasks / budget / edits intact. Stamp "now" so the
            // swap beats any older cloud copy on the next newer-wins merge and
            // propagates to the other device instead of being clobbered back.
            if (
              hasOldItinerary ||
              missingRouteStops ||
              hasWrongResort ||
              hasFridayToverland ||
              hasAugustBusSafari ||
              missingEftelingPagode ||
              hasPhantomMeals
            ) {
              return {
                ...t,
                days: freshHolland.days,
                accommodations,
                docUrl: t.docUrl ?? freshHolland.docUrl,
                docLastPulledAt: freshHolland.docLastPulledAt,
                updatedAt: now,
              }
            }
            return t
          })
        }

        // One-shot: reconcile Holland booking-reminder tasks to the refreshed
        // seed. Scoped to the seed's booking namespace so the user's own tasks
        // (random UUIDs) and the flight tasks are never touched. Drops reminders
        // for places no longer in the plan, refreshes moved-date wording, and
        // adds the new bookings — all while preserving the user's done-state.
        // Self-limiting: skips when already reconciled so it won't re-bump.
        const BOOKING_NS = 'a1b2c3d4-e5f6-4001-8001-'
        if (freshHolland) {
          const seedBooking = (freshHolland.tasks ?? []).filter(s => s.id.startsWith(BOOKING_NS))
          const seedById = new globalThis.Map(seedBooking.map(s => [s.id, s]))
          const seedIds = new Set(seedBooking.map(s => s.id))
          state.trips = state.trips.map(t => {
            if (t.id !== HOLLAND_ID) return t
            const before = t.tasks ?? []
            const haveIds = new Set(before.map(x => x.id))
            const hasStale = before.some(x => x.id.startsWith(BOOKING_NS) && !seedIds.has(x.id))
            const missingNew = seedBooking.some(s => !haveIds.has(s.id))
            const drift = before.some(x => {
              const s = seedById.get(x.id)
              return !!s && (s.title !== x.title || s.description !== x.description ||
                s.dueDate !== x.dueDate || s.assignedTo !== x.assignedTo)
            })
            if (!hasStale && !missingNew && !drift) return t
            // Keep non-booking tasks as-is; drop booking tasks the seed dropped;
            // refresh surviving booking tasks from seed but keep done-state.
            const tasks = before
              .filter(x => !x.id.startsWith(BOOKING_NS) || seedIds.has(x.id))
              .map(x => {
                const s = seedById.get(x.id)
                return s ? { ...s, done: x.done, completedAt: x.completedAt } : x
              })
            for (const s of seedBooking) if (!haveIds.has(s.id)) tasks.push(s)
            return { ...t, tasks, updatedAt: new Date().toISOString() }
          })
        }

        // One-shot: backfill the SIXT rental (booking 9735028799), found in
        // Gmail after the plan had shipped with an empty carRentals and a
        // "book a car" reminder that was already done. Each half is guarded on
        // its own absence, so this can't fire twice or clobber later edits.
        const CAR_TASK_ID = '52489398-f1b1-4d25-b419-9e5c1780ee16'
        const CAR_BUDGET_ID = '3c7d1e90-4b28-4f6a-9d31-5e8a2f0c7b44'
        if (freshHolland) {
          state.trips = state.trips.map(t => {
            if (t.id !== HOLLAND_ID) return t
            const needsCar = (t.carRentals ?? []).length === 0
            const seedTask = (freshHolland.tasks ?? []).find(s => s.id === CAR_TASK_ID)
            const staleTask = (t.tasks ?? []).find(
              x => x.id === CAR_TASK_ID && !!seedTask && x.title !== seedTask.title
            )
            const seedLine = (freshHolland.budget?.items ?? []).find(s => s.id === CAR_BUDGET_ID)
            const needsLine =
              !!seedLine && !(t.budget?.items ?? []).some(x => x.id === CAR_BUDGET_ID)
            if (!needsCar && !staleTask && !needsLine) return t
            return {
              ...t,
              carRentals: needsCar ? freshHolland.carRentals : t.carRentals,
              // Keep done-state: Ben may already have pushed the pickup time.
              tasks: staleTask
                ? (t.tasks ?? []).map(x =>
                    x.id === CAR_TASK_ID
                      ? { ...seedTask!, done: x.done, completedAt: x.completedAt }
                      : x
                  )
                : t.tasks,
              budget: needsLine
                ? { ...t.budget, items: [...(t.budget?.items ?? []), seedLine!] }
                : t.budget,
              updatedAt: new Date().toISOString(),
            }
          })
        }

        // One-shot: backfill what the confirmation emails turned out to hold —
        // the GuestHouse stay's real price and the fact that it bundles the
        // Efteling entry, plus the two prepaid lines the budget never had
        // (that stay, and the Toverland tickets). Guarded per-field so it
        // settles after one pass.
        const GH_BUDGET_ID = '8f2a1b04-6c93-4e17-b528-0a4d9e13f7c2'
        const TOV_BUDGET_ID = 'd6b30f85-21ac-4e9f-9c07-3b1e5a7d2049'
        if (freshHolland) {
          state.trips = state.trips.map(t => {
            if (t.id !== HOLLAND_ID) return t
            const seedGh = (freshHolland.accommodations ?? []).find(a =>
              a.name.startsWith('GuestHouse')
            )
            const staleGh = (t.accommodations ?? []).some(
              a => a.name.startsWith('GuestHouse') && !a.confirmationNumber
            )
            const seedLines = (freshHolland.budget?.items ?? []).filter(
              s => s.id === GH_BUDGET_ID || s.id === TOV_BUDGET_ID
            )
            const have = new Set((t.budget?.items ?? []).map(x => x.id))
            const missing = seedLines.filter(s => !have.has(s.id))
            if ((!staleGh || !seedGh) && !missing.length) return t
            return {
              ...t,
              accommodations:
                staleGh && seedGh
                  ? (t.accommodations ?? []).map(a =>
                      a.name.startsWith('GuestHouse') ? { ...a, ...seedGh, id: a.id } : a
                    )
                  : t.accommodations,
              budget: missing.length
                ? { ...t.budget, items: [...(t.budget?.items ?? []), ...missing] }
                : t.budget,
              updatedAt: new Date().toISOString(),
            }
          })
        }

        // One-shot: replace stale Crete trip — original seed assumed a 7-night
        // stay (21–28/5) based on partial Aquila correspondence; actual trip
        // was 21–24/5. Detect stale by old endDate.
        const CRETE_ID = 'b2c5f8a3-4d9e-4f1b-8c6a-7e2d5b9f3a18'
        const freshCrete = DEMO_TRIPS.find(t => t.id === CRETE_ID)
        if (freshCrete) {
          state.trips = state.trips.map(t => {
            if (t.id !== CRETE_ID) return t
            const oldEnd = t.endDate === '2026-05-28'
            return oldEnd ? freshCrete : t
          })
        }

        // One-shot: the Paris seed shipped its El Al times as UTC (Z-suffixed),
        // so the app rendered a 16:05 departure as 19:05 in Israel TZ. The
        // fixed seed stores local airport time like every other trip. Swap the
        // flights only — tasks, budget and any itinerary the user has since
        // written stay put. Self-limiting: after the swap no time ends in Z.
        const PARIS_ID = 'a1f4e9b2-3c8d-4e6a-9b7c-1d5e8f7a2b34'
        const freshParis = DEMO_TRIPS.find(t => t.id === PARIS_ID)
        if (freshParis) {
          state.trips = state.trips.map(t => {
            if (t.id !== PARIS_ID) return t
            const hasUtcFlightTimes = (t.flights ?? []).some(f =>
              (f.departureTime ?? '').endsWith('Z') || (f.arrivalTime ?? '').endsWith('Z')
            )
            if (!hasUtcFlightTimes) return t
            return { ...t, flights: freshParis.flights, updatedAt: new Date().toISOString() }
          })
        }

        // One-shot: every seed shipped the same family-member UUIDs, but
        // family_members.id is a global primary key — so only the first trip to
        // reach Supabase could hold them. That is the whole reason Crete and
        // Paris never synced: their push died on a duplicate-key error that
        // surfaced as a generic sync failure. Holland got there first and keeps
        // the original ids; the other seeds now carry their own, and this
        // remaps any live copy still holding the collided ones.
        const HOLLAND_FAMILY = new Set(
          (DEMO_TRIPS.find(t => t.id === HOLLAND_ID)?.family ?? []).map(m => m.id)
        )
        state.trips = state.trips.map(t => {
          if (t.id === HOLLAND_ID) return t
          const seed = DEMO_TRIPS.find(s => s.id === t.id)
          if (!seed) return t
          const collides = (t.family ?? []).some(m => HOLLAND_FAMILY.has(m.id))
          if (!collides) return t
          // Names are what survive the id change, and within one family they're
          // unique — "בן", "גל", "עומר", "ארי".
          const byName = new Map(seed.family.map(m => [m.name, m.id]))
          const remap = new Map(
            (t.family ?? [])
              .map(m => [m.id, byName.get(m.name)] as const)
              .filter((p): p is readonly [string, string] => Boolean(p[1]))
          )
          const to = (id?: string) => (id && remap.get(id)) || id
          return {
            ...t,
            family: (t.family ?? []).map(m => ({ ...m, id: to(m.id) ?? m.id })),
            tasks: (t.tasks ?? []).map(x => ({ ...x, assignedTo: to(x.assignedTo) })),
            budget: {
              ...t.budget,
              items: (t.budget?.items ?? []).map(x => ({ ...x, paidBy: to(x.paidBy) })),
            },
          }
        })

        state.trips = state.trips.map(t => ({
          ...t,
          tasks: t.tasks ?? [],
          packingItems: t.packingItems ?? [],
          carRentals: t.carRentals ?? [],
        }))

        // Normalize the legacy far-future updatedAt sentinel (2099) the
        // Crete/Holland seeds used to ship with. Left in place it makes this
        // device reject every edit pulled from the spouse's device — and it
        // would also let a stale cloud copy clobber the itinerary swap above.
        // Rewrite to createdAt so newer-wins works. See seedNormalize.
        state.trips = state.trips.map(normalizeSeedTimestamp)

        // Carry the linked Google Doc URL onto live trips that predate it, so
        // the Doc↔app link survives on already-installed devices. Authenticated
        // cloud hydrate also runs this (seedDocLink) because persist can start
        // empty for an invitee.
        state.trips = ensureSeedDocLinks(state.trips)

        // Canonical booking-reference cards (El Al PNRs, Utopia sailing) that
        // don't need Gmail. Self-limiting by document id. Must run after the
        // Doc URL copy so a USA trip that already exists still gets them —
        // server-wins used to leave the tab at (0).
        state.trips = ensureSeedBookingDocuments(state.trips, DEMO_TRIPS)
      },
    }
  )
)

/**
 * Point persist at this user's cache (or the guest catalog). Does not delete
 * cloud data. Signing out always resets the in-memory/guest list to stock
 * demos so a previous account's USA trip cannot reappear from the old shared
 * `myk-trip-plan-store` key.
 */
export async function switchTripStoreAccount(userId: string | null): Promise<void> {
  const previous = getTripStoreAccount()
  const nextName = tripStorePersistName(userId)
  const currentName = useTripStore.persist.getOptions().name
  if (previous === userId && currentName === nextName) return

  setTripStoreAccount(userId)
  useTripStore.persist.setOptions({ name: nextName })

  const plan = planTripStoreAccountSwitch(previous, userId, persistHasEntry(nextName))
  if (plan.resetTo === 'noop') return
  if (plan.resetTo === 'rehydrate') {
    await useTripStore.persist.rehydrate()
    return
  }
  if (plan.resetTo === 'guest-demos') {
    useTripStore.setState({
      trips: DEMO_TRIPS.map(t => structuredClone(t)),
      activeTripId: DEMO_TRIP.id,
    })
    return
  }

  useTripStore.setState({ trips: [], activeTripId: null })
}

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
