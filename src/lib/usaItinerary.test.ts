import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripPlan } from '../types/trip-plan.ts'
import { buildTripFrontPoster, collectFrontStops } from './tripFrontPoster.ts'
import { extractTripMapPois } from './tripMapPois.ts'

const usa = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as TripPlan

const STALE = /Animal Kingdom|Miami Beach|Cocoa Beach|חוף\s*\/\s*מנוחה/i

describe('USA Mar 2027 seed: Orlando after cruise, Epcot not Animal Kingdom', () => {
  it('keeps locked cruise and flight dates', () => {
    assert.equal(usa.id, 'b38fc010-9096-45c9-b8df-191e369143dc')
    assert.equal(usa.startDate, '2027-03-19')
    assert.equal(usa.endDate, '2027-04-02')
    const cruise = (usa.accommodations ?? []).find(a => /utopia/i.test(a.name))
    assert.ok(cruise)
    assert.equal(cruise!.checkIn, '2027-03-22')
    assert.equal(cruise!.checkOut, '2027-03-26')
    assert.ok(usa.flights.some(f => /LY\s*17/i.test(f.flightNumber)))
    assert.ok(usa.flights.some(f => /LY\s*18/i.test(f.flightNumber)))
  })

  it('has no stale Miami-beach / Animal Kingdom markers', () => {
    const blob = JSON.stringify(usa)
    assert.equal(STALE.test(blob), false, blob.match(STALE)?.[0])
  })

  it('21.3 is Epcot and post-cruise days are Orlando parks / villa', () => {
    const byDate = Object.fromEntries(usa.days.map(d => [d.date, d]))
    assert.match(byDate['2027-03-21']?.label ?? '', /epcot/i)
    assert.match(byDate['2027-03-26']?.label ?? '', /אורלנדו/)
    assert.match(byDate['2027-03-27']?.label ?? '', /seaworld/i)
    assert.match(byDate['2027-03-28']?.label ?? '', /peppa/i)
    assert.match(byDate['2027-03-30']?.label ?? '', /gatorland/i)
    assert.equal(/מיאמי|חוף/.test(byDate['2027-03-26']?.label ?? ''), false)
    const postCruiseVilla = (usa.accommodations ?? []).find(a => a.checkIn === '2027-03-26')
    assert.ok(postCruiseVilla)
    assert.match(postCruiseVilla!.name, /solterra|windsor|אורלנדו/i)
    assert.equal(postCruiseVilla!.type, 'villa')
    assert.equal(postCruiseVilla!.checkOut, '2027-04-01')
  })

  it('poster and map regenerate from the new days', () => {
    const poster = buildTripFrontPoster(usa)
    const titles = poster.stops.map(s => s.title).join(' | ')
    assert.match(titles, /epcot/i)
    assert.match(titles, /disney springs|seaworld|peppa|gatorland/i)
    assert.equal(/animal kingdom/i.test(titles), false)
    assert.equal(/miami beach/i.test(titles), false)
    assert.equal(/חוף/.test(titles), false)
    const pois = extractTripMapPois(usa)
    assert.ok(pois.some(p => /epcot/i.test(p.name)))
    assert.equal(pois.some(p => /animal kingdom/i.test(p.name)), false)
    assert.equal(pois.some(p => /miami beach/i.test(p.name)), false)
  })
})

describe('USA live-seed repair wiring', () => {
  it('repairLiveSeedTrips one-shot looks for the old Miami-beach / AK markers', () => {
    const src = readFileSync(new URL('./repairLiveSeedTrips.ts', import.meta.url), 'utf8')
    assert.match(src, /b38fc010-9096-45c9-b8df-191e369143dc/)
    assert.match(src, /Miami Beach/)
    assert.match(src, /Animal Kingdom/)
    assert.match(src, /חוף\\s\*\\\/\\s\*מנוחה/)
    assert.match(src, /days: freshUsa\.days/)
    assert.equal(STALE.test(JSON.stringify(usa)), false)
  })

  it('a stale Miami-beach day list would produce the old poster stop', () => {
    const stale = structuredClone(usa)
    const day26 = stale.days.find(d => d.date === '2027-03-26')!
    day26.label = 'ירידה מהאונייה → מיאמי'
    day26.events = [{
      id: 'stale-mb',
      dayId: day26.id,
      startTime: '16:00',
      title: 'ערב Miami Beach',
      location: 'Miami Beach, Florida',
      category: 'activity',
    }]
    const titles = collectFrontStops(stale).map(s => s.title).join(' | ')
    assert.match(titles, /miami beach/i)
    const fresh = collectFrontStops(usa).map(s => s.title).join(' | ')
    assert.equal(/miami beach/i.test(fresh), false)
    assert.match(fresh, /disney springs|epcot|seaworld/i)
  })
})
