import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TripPlan } from '../types/trip-plan.ts'
import { extractTripMapPois } from './tripMapPois.ts'
import { collectDayStops, layoutWindingRoad, layoutDayPoster } from './tripMapDayStops.ts'
import { deriveTripSegments, flowPillsFromDays } from './tripMapSegments.ts'
import { layoutOverviewMap, matchingRegionPack } from './tripMapGeo.ts'

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

describe('illustrated diary maps are trip-generic', () => {
  it('builds a winding-road stop list for every day of every family seed', () => {
    for (const trip of [usa, holland, crete, paris, rome]) {
      const pois = extractTripMapPois(trip)
      assert.ok((trip.days?.length ?? 0) > 0, trip.name)
      for (const day of trip.days) {
        const stops = collectDayStops(day, pois)
        assert.ok(stops.length >= 1, `${trip.name} ${day.date}`)
        const road = layoutWindingRoad(stops.length, day.id)
        assert.equal(road.stops.length, stops.length)
        assert.match(road.d, /^M/)
        assert.ok(road.height >= 980)
        assert.ok(road.car)
        const poster = layoutDayPoster(stops, day.id)
        assert.equal(poster.chips.length, stops.length)
        for (const stop of stops) {
          assert.match(stop.blurb, HE)
        }
      }
    }
  })

  it('USA overview uses the Florida silhouette; Holland uses the Netherlands one', () => {
    const usaLayout = layoutOverviewMap(extractTripMapPois(usa))
    assert.equal(usaLayout.packId, 'florida')
    assert.ok(usaLayout.landD.includes('M'))
    assert.ok(usaLayout.routeD.includes('M'))
    assert.equal(usaLayout.placed.length, extractTripMapPois(usa).length)

    const nlLayout = layoutOverviewMap(extractTripMapPois(holland))
    assert.equal(nlLayout.packId, 'netherlands')
    assert.ok(nlLayout.placed.some(p => /efteling|אפטלינג|kaatsheuvel|schiphol|סכיפהול/i.test(p.name)))
  })

  it('Holland pins stay in the Low Countries and drop TLV', () => {
    const pois = extractTripMapPois(holland)
    assert.ok(pois.length >= 3)
    for (const p of pois) {
      assert.ok(p.coords.lat > 50.5 && p.coords.lat < 54, p.name)
      assert.ok(p.coords.lon > 3 && p.coords.lon < 8, p.name)
    }
    assert.equal(pois.some(p => /נתב|gurion/i.test(p.name)), false)
  })

  it('Rome keeps Fiumicino after region focus', () => {
    const pois = extractTripMapPois(rome)
    assert.ok(pois.some(p => /fiumicino|פיומי/i.test(p.name)))
    assert.equal(pois.some(p => /נתב|gurion/i.test(p.name)), false)
  })

  it('segments follow stays and update when a night is added', () => {
    const before = deriveTripSegments(usa)
    assert.ok(before.length >= 3)
    const cloned = structuredClone(usa)
    cloned.days.push({
      id: 'extra-day',
      date: '2027-04-03',
      label: 'יום נוסף בלו״ז',
      events: [{
        id: 'extra-ev',
        dayId: 'extra-day',
        startTime: '10:00',
        title: '☕ קפה ביום נוסף',
        category: 'other',
        location: 'Miami Beach, Florida',
      }],
    })
    const after = deriveTripSegments(cloned)
    assert.ok(after.length >= before.length)
    assert.ok(after.some(s => s.dayIds.includes('extra-day')))
  })

  it('flow pills come from day labels, not a hardcoded country list', () => {
    const usaPills = flowPillsFromDays(usa.days)
    assert.ok(usaPills.some(p => /magic kingdom/i.test(p)))
    const nlPills = flowPillsFromDays(holland.days)
    assert.ok(nlPills.length >= 3)
    assert.equal(nlPills.join(' ').toLowerCase().includes('tokyo'), false)
  })

  it('empty-event days still get a Hebrew placeholder stop', () => {
    const empty = crete.days.find(d => (d.events ?? []).length === 0)
    assert.ok(empty)
    const stops = collectDayStops(empty!, [])
    assert.equal(stops.length, 1)
    assert.match(stops[0].blurb, HE)
  })

  it('does not treat a non-Florida cluster as Florida', () => {
    const pack = matchingRegionPack([{ lat: 48.86, lon: 2.35 }])
    assert.equal(pack, undefined)
  })
})

describe('map page wiring is generic and seed-safe', () => {
  it('Map.tsx is a diary of the live trip store, not a USA hardcoded poster', () => {
    const page = readFileSync(join(root, 'src/pages/Map.tsx'), 'utf8')
    assert.equal(page.includes('familySeeds'), false)
    assert.equal(page.includes('usa-trip'), false)
    assert.equal(page.includes('leaflet'), false)
    assert.equal(page.includes('FloridaTripMap'), false)
    assert.ok(page.includes('useTripStore'))
    assert.ok(page.includes('IllustratedOverviewMap'))
    assert.ok(page.includes('WindingDayRoad'))
    assert.ok(page.includes('מפה מצוירת'))
  })

  it('overview and day-road components do not import Leaflet tiles', () => {
    const overview = readFileSync(join(root, 'src/components/map/IllustratedOverviewMap.tsx'), 'utf8')
    const road = readFileSync(join(root, 'src/components/map/WindingDayRoad.tsx'), 'utf8')
    assert.equal(overview.includes('leaflet'), false)
    assert.equal(overview.includes('TileLayer'), false)
    assert.equal(road.includes('leaflet'), false)
    assert.ok(overview.includes('layoutOverviewMap'))
  })
})
