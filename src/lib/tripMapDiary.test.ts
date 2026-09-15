import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TripPlan } from '../types/trip-plan.ts'
import { extractTripMapPois } from './tripMapPois.ts'
import { collectDayStops, layoutWindingRoad, layoutDayPoster } from './tripMapDayStops.ts'
import { deriveTripSegments, flowPillsFromDays } from './tripMapSegments.ts'
import { layoutOverviewMap, matchingRegionPack, directedHopsFromPoints } from './tripMapGeo.ts'

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
        assert.ok(road.height >= 1040)
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
    assert.equal(usaLayout.hops.length, Math.max(0, usaLayout.placed.length - 1))
    assert.equal(usaLayout.placed[0]?.seq, 1)
    assert.equal(usaLayout.hops[0]?.fromId, usaLayout.placed[0]?.id)
    assert.equal(usaLayout.hops[0]?.toId, usaLayout.placed[1]?.id)
    assert.ok(usaLayout.hops.every(h => h.d.includes('Q')))

    const nlLayout = layoutOverviewMap(extractTripMapPois(holland))
    assert.equal(nlLayout.packId, 'netherlands')
    assert.ok(nlLayout.placed.some(p => /efteling|אפטלינג|kaatsheuvel|schiphol|סכיפהול/i.test(p.name)))
  })

  it('directed hops follow array order so a schedule edit changes 1→2→3', () => {
    const hops = directedHopsFromPoints([
      { id: 'a', x: 10, y: 10 },
      { id: 'b', x: 80, y: 40 },
      { id: 'c', x: 40, y: 90 },
    ])
    assert.equal(hops.length, 2)
    assert.equal(hops[0].fromId, 'a')
    assert.equal(hops[0].toId, 'b')
    assert.equal(hops[0].fromSeq, 1)
    assert.equal(hops[0].toSeq, 2)
    assert.equal(hops[1].fromId, 'b')
    assert.equal(hops[1].toId, 'c')
    const reversed = directedHopsFromPoints([
      { id: 'c', x: 40, y: 90 },
      { id: 'a', x: 10, y: 10 },
    ])
    assert.equal(reversed[0].fromId, 'c')
    assert.equal(reversed[0].toId, 'a')
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

  it('overview draws numbered arrows, not a crisscross dotted spline', () => {
    const overview = readFileSync(join(root, 'src/components/map/IllustratedOverviewMap.tsx'), 'utf8')
    assert.ok(overview.includes('overview-route-arrow'))
    assert.ok(overview.includes('layout.hops'))
    assert.ok(overview.includes('SeqBadge'))
    assert.equal(overview.includes('strokeDasharray="2 11"'), false)
    assert.ok(overview.includes('מסלול ממוספר לפי הלו״ז'))
  })

  it('overview and day-road components do not import Leaflet tiles', () => {
    const overview = readFileSync(join(root, 'src/components/map/IllustratedOverviewMap.tsx'), 'utf8')
    const road = readFileSync(join(root, 'src/components/map/WindingDayRoad.tsx'), 'utf8')
    assert.equal(overview.includes('leaflet'), false)
    assert.equal(overview.includes('TileLayer'), false)
    assert.equal(road.includes('leaflet'), false)
    assert.ok(overview.includes('layoutOverviewMap'))
  })

  it('הלוח is a day strip that opens the itinerary לו״ז', () => {
    const page = readFileSync(join(root, 'src/pages/Map.tsx'), 'utf8')
    const cal = readFileSync(join(root, 'src/components/map/MiniTripCalendars.tsx'), 'utf8')
    assert.ok(page.includes('הלוח'))
    assert.ok(page.includes('/itinerary?day='))
    assert.equal(page.includes('לוח שנה'), false)
    assert.equal(cal.includes('eachDayOfInterval'), false)
    assert.equal(cal.includes('startOfMonth'), false)
    assert.ok(cal.includes('לחיצה על יום פותחת את הלו״ז'))
  })
})
