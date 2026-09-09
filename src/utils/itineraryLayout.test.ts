import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { itineraryGridColumns } from './itineraryLayout.ts'
import { getTripDuration } from './date.ts'

describe('itineraryGridColumns', () => {
  it('uses a definite 1/2/3 count so auto-fit cannot freeze long trips', () => {
    assert.equal(itineraryGridColumns(true, true), 1)
    assert.equal(itineraryGridColumns(false, true), 2)
    assert.equal(itineraryGridColumns(false, false), 3)
  })
})

describe('USA seed itinerary', () => {
  const usa = JSON.parse(readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8')) as {
    id: string
    startDate: string
    endDate: string
    days: Array<{ id: string; date: string; events: unknown[] }>
  }

  it('has a bounded day list matching the trip duration (the freeze repro)', () => {
    assert.equal(usa.id, 'b38fc010-9096-45c9-b8df-191e369143dc')
    const duration = getTripDuration(usa.startDate, usa.endDate)
    assert.equal(duration, 15)
    assert.equal(usa.days.length, duration)
    assert.ok(usa.days.length <= 31, 'seed day count should stay well below a layout-thrash threshold')
    const ids = usa.days.map(d => d.id)
    assert.equal(new Set(ids).size, ids.length, 'day ids must be unique')
    for (const day of usa.days) {
      assert.ok(Array.isArray(day.events), `${day.date} must have an events array`)
    }
  })
})
