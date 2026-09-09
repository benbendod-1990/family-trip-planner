import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TripPlan } from '../types/trip-plan.ts'
import {
  buildTripFrontPoster,
  collectFrontStops,
  collectFrontStays,
  formatPosterDateRange,
} from './tripFrontPoster.ts'
import { anyRectsOverlap } from './mapLabelLayout.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const HE = /[\u0590-\u05FF]/

function loadSeed(name: string): TripPlan {
  return JSON.parse(
    readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'),
  ) as TripPlan
}

const usa = loadSeed('usa-trip.json')
const holland = loadSeed('holland-trip.json')
const crete = loadSeed('crete-trip.json')
const paris = loadSeed('paris-trip.json')
const rome = loadSeed('rome-trip.json')

describe('trip front poster is data-driven for every seed', () => {
  it('builds a winding-road poster for every family seed', () => {
    for (const trip of [usa, holland, crete, paris, rome]) {
      const poster = buildTripFrontPoster(trip)
      assert.ok(poster.stops.length >= 1, trip.name)
      assert.ok(poster.stops.length <= (trip.days?.length ?? 0), trip.name)
      assert.match(poster.layout.roadD, /^M/)
      assert.equal(poster.layout.stops.length, poster.stops.length)
      assert.equal(poster.layout.chips.length, poster.stops.length)
      for (const stop of poster.stops) {
        assert.match(stop.blurb, HE)
        assert.ok(stop.index >= 1)
        assert.ok(stop.chipTitle.length > 0)
        assert.ok(stop.chipTitle.length <= 18, stop.chipTitle)
      }
    }
  })

  it('USA front looks like the Florida itinerary, not a geo sketch', () => {
    const poster = buildTripFrontPoster(usa)
    const blob = poster.stops.map(s => `${s.title} ${s.placeKey ?? ''}`).join(' | ')
    assert.match(blob, /magic kingdom/i)
    assert.match(blob, /animal kingdom/i)
    assert.match(blob, /cococay|perfect day/i)
    assert.match(blob, /utopia/i)
    assert.match(blob, /miami/i)
    assert.ok(poster.stays.length >= 3)
    assert.ok(poster.stays.some(s => /solterra/i.test(s.name)))
    assert.ok(poster.stops.length < usa.days.length, 'TBD rest days should collapse')
    assert.equal(anyRectsOverlap(poster.layout.chips, 2), false)
  })

  it('Holland uses the same layout language with Dutch stops', () => {
    const poster = buildTripFrontPoster(holland)
    const blob = poster.stops.map(s => s.title).join(' ')
    assert.match(blob, /אפטלינג|efteling|beekse|סכיפהול|schiphol/i)
    assert.ok(poster.layout.height >= 1180)
  })

  it('regenerates when a day is added to the itinerary', () => {
    const before = collectFrontStops(usa)
    const cloned = structuredClone(usa)
    cloned.days.push({
      id: 'extra-front-day',
      date: '2027-04-04',
      label: 'יום נוסף בלו״ז',
      events: [{
        id: 'extra-front-ev',
        dayId: 'extra-front-day',
        startTime: '10:00',
        title: '🎢 Universal Studios',
        category: 'activity',
        location: 'Universal Studios Florida',
        description: 'יום פארק נוסף אחרי שינוי בלו״ז.',
      }],
    })
    const after = collectFrontStops(cloned)
    assert.ok(after.length > before.length)
    assert.ok(after.some(s => /universal/i.test(s.title)))
  })

  it('stay boards use short names and numeric date ranges', () => {
    const stays = collectFrontStays(usa)
    assert.ok(stays.every(s => /\d+\.\d+/.test(s.dateRange)))
    assert.ok(stays.every(s => s.name.length <= 40))
    assert.equal(formatPosterDateRange('2027-03-19', '2027-03-22'), '19.3–22.3')
  })
})

describe('dashboard entry shows the front poster, map keeps day roads', () => {
  it('Dashboard.tsx mounts TripFrontPoster and does not import Leaflet', () => {
    const page = readFileSync(join(root, 'src/pages/Dashboard.tsx'), 'utf8')
    assert.ok(page.includes('TripFrontPoster'))
    assert.ok(page.includes('StaySignRow'))
    assert.ok(page.includes('PoiBlurbSheet'))
    assert.equal(page.includes('leaflet'), false)
    assert.equal(page.includes('familySeeds'), false)
    assert.equal(page.includes('usa-trip'), false)
  })

  it('Map.tsx still offers per-day winding roads as secondary', () => {
    const page = readFileSync(join(root, 'src/pages/Map.tsx'), 'utf8')
    assert.ok(page.includes('WindingDayRoad'))
    assert.ok(page.includes('יום ביום'))
    assert.equal(page.includes('leaflet'), false)
  })
})
