import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { TripPlan } from '../types/trip-plan.ts'
import type { TripTask } from '../types/task.ts'
import {
  CANONICAL_SEED_IDENTITIES,
  collapseSeedNearDuplicates,
  ensureDemoTrips,
  isNearDuplicateOfSeed,
  titlesAreSimilar,
} from './dedupeDemoTrips.ts'

const HOLLAND: Pick<TripPlan, 'id' | 'name' | 'destination' | 'startDate' | 'endDate'> = {
  id: '34980c90-bd66-4270-8d45-3e96787b07ef',
  name: 'הולנד — אוגוסט 2026',
  destination: 'הולנד',
  startDate: '2026-08-18',
  endDate: '2026-08-27',
}
const PARIS = {
  id: 'a1f4e9b2-3c8d-4e6a-9b7c-1d5e8f7a2b34',
  name: 'פריז — אוקטובר 2026 (בן + גל)',
  destination: 'פריז, צרפת',
  startDate: '2026-10-15',
  endDate: '2026-10-19',
}
const CRETE = {
  id: 'b2c5f8a3-4d9e-4f1b-8c6a-7e2d5b9f3a18',
  name: 'כרתים — מאי 2026',
  destination: 'רתימנו, כרתים, יוון',
  startDate: '2026-05-21',
  endDate: '2026-05-24',
}
const ROME = {
  id: '30a5d517-0db3-427f-adfa-92ef125e1f8f',
  name: 'רומא — נובמבר 2026',
  destination: 'רומא, איטליה',
  startDate: '2026-11-26',
  endDate: '2026-12-01',
}
const USA_ID = 'b38fc010-9096-45c9-b8df-191e369143dc'
const SEED_IDS = new Set([HOLLAND.id, PARIS.id, CRETE.id, ROME.id, USA_ID])

function task(partial: Partial<TripTask> & { id: string; title: string }): TripTask {
  return {
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function stub(partial: Partial<TripPlan> & Pick<TripPlan, 'id' | 'name' | 'destination' | 'startDate' | 'endDate'>): TripPlan {
  return {
    coverEmoji: '🧳',
    family: [],
    tasks: [],
    days: [],
    budget: { currency: 'ILS', totalBudget: 0, items: [] },
    accommodations: [],
    flights: [],
    carRentals: [],
    packingItems: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

const usaSeed = (): TripPlan => stub({
  id: USA_ID,
  name: 'ארה״ב — מרץ 2027',
  destination: 'פלורידה, ארה״ב',
  startDate: '2027-03-19',
  endDate: '2027-04-02',
  coverEmoji: '🇺🇸',
  days: [
    {
      id: 'seed-day',
      date: '2027-03-19',
      events: [{
        id: 'seed-evt',
        dayId: 'seed-day',
        startTime: '16:00',
        title: 'Solterra check-in',
        category: 'activity',
      }],
    },
  ],
  flights: [{
    id: 'seed-ly17',
    airline: 'El Al',
    flightNumber: 'LY 17',
    departureAirport: 'TLV',
    arrivalAirport: 'MIA',
    departureTime: '2027-03-19T01:00:00.000',
    arrivalTime: '2027-03-19T08:50:00.000',
    cost: 0,
    currency: 'USD',
    direction: 'outbound',
    cabinClass: 'economy',
    confirmationNumber: 'X5OKQQ / X5G7DK',
  }],
})

const cardB = (overrides: Partial<TripPlan> = {}): TripPlan => stub({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  name: 'ארה״ב — מרץ 2027 (פלורידה משפחתי)',
  destination: 'פלורידה, ארה״ב',
  startDate: '2027-03-19',
  endDate: '2027-04-01',
  coverEmoji: '🇺🇸',
  ...overrides,
})

const allSeeds = (): TripPlan[] => [
  stub({ ...HOLLAND, coverEmoji: '🌷' }),
  stub({ ...PARIS, coverEmoji: '🗼' }),
  stub({ ...CRETE, coverEmoji: '🏖️' }),
  stub({ ...ROME, coverEmoji: '🏛️' }),
  usaSeed(),
]

describe('titlesAreSimilar', () => {
  it('treats the screenshot titles as the same trip', () => {
    assert.equal(
      titlesAreSimilar('ארה״ב — מרץ 2027', 'ארה״ב — מרץ 2027 (פלורידה משפחתי)'),
      true,
    )
  })

  it('does not match a different destination title', () => {
    assert.equal(
      titlesAreSimilar('ארה״ב — מרץ 2027', 'ניו יורק — מרץ 2027'),
      false,
    )
  })
})

describe('isNearDuplicateOfSeed', () => {
  it('matches Card B against the USA seed', () => {
    assert.equal(isNearDuplicateOfSeed(cardB(), usaSeed(), SEED_IDS), true)
  })

  it('never flags another DEMO seed as a duplicate', () => {
    assert.equal(isNearDuplicateOfSeed(stub({ ...ROME }), usaSeed(), SEED_IDS), false)
    assert.equal(isNearDuplicateOfSeed(usaSeed(), stub({ ...HOLLAND }), SEED_IDS), false)
  })
})

describe('collapseSeedNearDuplicates', () => {
  it('keeps the canonical USA seed and drops Card B', () => {
    const holland = stub({ ...HOLLAND, coverEmoji: '🌷' })
    const rome = stub({ ...ROME, coverEmoji: '🏛️' })
    const seed = usaSeed()
    const dup = cardB()
    const { trips, droppedIds } = collapseSeedNearDuplicates(
      [holland, seed, dup, rome],
      allSeeds(),
    )
    assert.deepEqual(droppedIds, [dup.id])
    assert.equal(trips.filter(t => /ארה|פלורידה|USA|Florida/i.test(`${t.name} ${t.destination}`)).length, 1)
    assert.ok(trips.some(t => t.id === USA_ID))
    assert.ok(trips.some(t => t.id === HOLLAND.id))
    assert.ok(trips.some(t => t.id === ROME.id))
    assert.equal(trips.find(t => t.id === USA_ID)?.endDate, '2027-04-02')
    assert.equal(trips.find(t => t.id === USA_ID)?.days[0]?.events[0]?.title, 'Solterra check-in')
  })

  it('copies unique user tasks onto the kept seed without wiping seed days', () => {
    const seed = usaSeed()
    const dup = cardB({
      days: [{ id: 'other-day', date: '2027-03-20', events: [] }],
      tasks: [task({ id: 'user-task-1', title: 'לקנות ביטוח נסיעות', done: true, completedAt: '2026-09-01T00:00:00.000Z' })],
      budget: { currency: 'USD', totalBudget: 0, items: [{ id: 'b1', category: 'other', label: 'טיפים', planned: 200 }] },
    })
    const { trips } = collapseSeedNearDuplicates([seed, dup], [seed])
    const kept = trips.find(t => t.id === USA_ID)!
    assert.equal(trips.length, 1)
    assert.equal(kept.days[0]?.events[0]?.title, 'Solterra check-in')
    assert.equal(kept.endDate, '2027-04-02')
    assert.equal(kept.tasks.some(t => t.title === 'לקנות ביטוח נסיעות' && t.done), true)
    assert.equal(kept.budget.items.some(i => i.label === 'טיפים'), true)
  })

  it('is a no-op when only the seed is present', () => {
    const seed = usaSeed()
    const { trips, droppedIds } = collapseSeedNearDuplicates([seed], [seed])
    assert.deepEqual(droppedIds, [])
    assert.equal(trips.length, 1)
    assert.equal(trips[0], seed)
  })

  it('does not drop an overlapping USA trip with a different title', () => {
    const seed = usaSeed()
    const nyc = stub({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'ניו יורק — מרץ 2027',
      destination: 'ניו יורק, ארה״ב',
      startDate: '2027-03-19',
      endDate: '2027-03-25',
    })
    const { trips, droppedIds } = collapseSeedNearDuplicates([seed, nyc], [seed])
    assert.deepEqual(droppedIds, [])
    assert.equal(trips.length, 2)
  })

  it('leaves Holland, Paris, Crete and Rome in place when collapsing USA', () => {
    const seeds = allSeeds()
    const dup = cardB()
    const { trips } = collapseSeedNearDuplicates([...seeds, dup], seeds)
    assert.deepEqual(trips.map(t => t.id).sort(), [...seeds.map(s => s.id)].sort())
    for (const s of [HOLLAND, PARIS, CRETE, ROME]) {
      assert.ok(trips.some(t => t.id === s.id && t.name === s.name && t.startDate === s.startDate))
    }
  })

  it('honors remembered redirects after the duplicate is renamed', () => {
    const seed = usaSeed()
    const renamed = cardB({ name: 'טיול משפחתי אביב' })
    const { trips, droppedIds } = collapseSeedNearDuplicates(
      [seed, renamed],
      [seed],
      { [renamed.id]: USA_ID },
    )
    assert.deepEqual(droppedIds, [renamed.id])
    assert.equal(trips.length, 1)
    assert.equal(trips[0].id, USA_ID)
  })

  it('is idempotent', () => {
    const seeds = allSeeds()
    const once = collapseSeedNearDuplicates([...seeds, cardB()], seeds)
    const twice = collapseSeedNearDuplicates(once.trips, seeds, once.redirects)
    assert.deepEqual(twice.droppedIds, [])
    assert.equal(twice.trips.length, seeds.length)
  })
})

describe('ensureDemoTrips', () => {
  it('injects the USA seed then drops a pre-existing near-duplicate', () => {
    const holland = stub({ ...HOLLAND, coverEmoji: '🌷' })
    const { trips, droppedIds } = ensureDemoTrips([holland, cardB()], allSeeds())
    assert.deepEqual(droppedIds, [cardB().id])
    assert.ok(trips.some(t => t.id === USA_ID))
    assert.equal(trips.filter(t => t.id === cardB().id).length, 0)
    assert.ok(trips.some(t => t.id === HOLLAND.id))
    assert.ok(trips.some(t => t.id === PARIS.id))
    assert.ok(trips.some(t => t.id === CRETE.id))
    assert.ok(trips.some(t => t.id === ROME.id))
    assert.equal(trips.filter(t => t.destination.includes('פלורידה')).length, 1)
  })

  it('does not duplicate seeds that are already present', () => {
    const seeds = allSeeds()
    const { trips, droppedIds } = ensureDemoTrips(seeds, seeds)
    assert.deepEqual(droppedIds, [])
    assert.equal(trips.length, 5)
  })
})

describe('CANONICAL_SEED_IDENTITIES', () => {
  it('covers Holland, Paris, Crete, Rome and USA', () => {
    const ids = CANONICAL_SEED_IDENTITIES.map(s => s.id)
    assert.deepEqual(ids.sort(), [HOLLAND.id, PARIS.id, CRETE.id, ROME.id, USA_ID].sort())
  })
})
