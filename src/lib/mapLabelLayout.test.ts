import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TripPlan } from '../types/trip-plan.ts'
import { extractTripMapPois } from './tripMapPois.ts'
import { collectDayStops, layoutDayPoster } from './tripMapDayStops.ts'
import { layoutOverviewMap } from './tripMapGeo.ts'
import {
  anyRectsOverlap,
  circleHitsRect,
  shortMapLabel,
  type Rect,
} from './mapLabelLayout.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const usa = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as TripPlan

function overlapPairs(rects: Rect[], gap = 4): string[] {
  const hits: string[] = []
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      const overlap = a.x < b.x + b.w + gap
        && a.x + a.w + gap > b.x
        && a.y < b.y + b.h + gap
        && a.y + a.h + gap > b.y
      if (overlap) hits.push(`${i}×${j}`)
    }
  }
  return hits
}

describe('short map labels', () => {
  it('keeps the first clause and caps length', () => {
    assert.equal(shortMapLabel('נחיתה ב-MIA + ביקורת דרכונים', 16).includes('+'), false)
    assert.ok([...shortMapLabel('צ׳ק-אין וילה (Solterra / Village at Solterra)', 16)].length <= 16)
    assert.equal(shortMapLabel('Magic Kingdom'), 'Magic Kingdom')
  })
})

describe('USA dense-day winding road is readable', () => {
  it('19 Mar chips do not overlap each other or their markers', () => {
    const day = usa.days.find(d => d.date === '2027-03-19')
    assert.ok(day)
    const pois = extractTripMapPois(usa)
    const stops = collectDayStops(day!, pois)
    assert.equal(stops.length, 5)
    const poster = layoutDayPoster(stops, day!.id)
    assert.ok(poster.height >= 1200, `tall canvas, got ${poster.height}`)
    const rects = poster.chips.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
    assert.equal(overlapPairs(rects, 4).join(','), '')
    for (let i = 0; i < stops.length; i++) {
      const chip = poster.chips[i]
      const pt = poster.road.stops[i]
      assert.equal(circleHitsRect(pt.x, pt.y, 18, chip, 2), false, chip.text)
      assert.ok(chip.x >= 0 && chip.x + chip.w <= poster.width)
      assert.ok(chip.y >= 0 && chip.y + chip.h <= poster.height)
      assert.equal(chip.text.includes('PNR'), false)
    }
    for (let i = 1; i < poster.road.stops.length; i++) {
      const a = poster.road.stops[i - 1]
      const b = poster.road.stops[i]
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 140, `stops ${i - 1} and ${i} too close`)
    }
  })

  it('overview chips stay off icons and off each other', () => {
    const pois = extractTripMapPois(usa)
    const layout = layoutOverviewMap(pois)
    assert.equal(layout.chips.length, layout.placed.length)
    const rects = layout.chips.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
    assert.equal(overlapPairs(rects, 4).join(','), '')
    for (const p of layout.placed) {
      const chip = layout.chips.find(c => c.id === p.id)
      assert.ok(chip)
      assert.equal(circleHitsRect(p.x, p.y, 28, chip!, 2), false, chip!.text)
    }
  })

  it('Holland and Rome overviews also keep chips apart', () => {
    const holland = JSON.parse(
      readFileSync(new URL('../data/holland-trip.json', import.meta.url), 'utf8'),
    ) as TripPlan
    const rome = JSON.parse(
      readFileSync(new URL('../data/rome-trip.json', import.meta.url), 'utf8'),
    ) as TripPlan
    for (const trip of [holland, rome]) {
      const layout = layoutOverviewMap(extractTripMapPois(trip))
      const rects = layout.chips.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      assert.equal(overlapPairs(rects, 4).join(','), '', trip.name)
    }
  })
})

describe('poster components dropped always-on blurb cards', () => {
  it('day road renders short chips, not stacked CalloutDetail cards', () => {
    const src = readFileSync(join(root, 'src/components/map/WindingDayRoad.tsx'), 'utf8')
    assert.equal(src.includes('CalloutDetail'), false)
    assert.equal(src.includes('-webkit-line-clamp'), false)
    assert.ok(src.includes('layoutDayPoster'))
    assert.ok(src.includes('DayRoadScenery'))
    assert.ok(src.includes('לחצו על תחנה לפירוט'))
  })

  it('overview uses a dotted path and separate icon/chip layers', () => {
    const src = readFileSync(join(root, 'src/components/map/IllustratedOverviewMap.tsx'), 'utf8')
    assert.ok(src.includes('strokeDasharray="2 11"'))
    assert.equal(src.includes('strokeWidth="7"'), false)
    assert.ok(src.includes('layout.chips'))
    assert.equal(src.includes('leaflet'), false)
  })
})

describe('overlap helper', () => {
  it('detects stacked cards', () => {
    assert.equal(anyRectsOverlap([
      { x: 10, y: 10, w: 80, h: 40 },
      { x: 20, y: 20, w: 80, h: 40 },
    ]), true)
    assert.equal(anyRectsOverlap([
      { x: 10, y: 10, w: 40, h: 20 },
      { x: 80, y: 80, w: 40, h: 20 },
    ]), false)
  })
})
