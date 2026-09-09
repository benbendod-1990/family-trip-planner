import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TripPlan } from '../types/trip-plan.ts'
import {
  collectPlaceCandidates,
  extractTripMapPois,
  isSkippableMapLocation,
  canonicalPlaceKey,
} from './tripMapPois.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const usa = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as TripPlan

const HE = /[\u0590-\u05FF]/

describe('map location skip rules', () => {
  it('skips at-sea and empty locations, keeps land POIs', () => {
    assert.equal(isSkippableMapLocation(undefined), true)
    assert.equal(isSkippableMapLocation(''), true)
    assert.equal(isSkippableMapLocation('Utopia of the Seas (at sea)'), true)
    assert.equal(isSkippableMapLocation('Utopia of the Seas'), true)
    assert.equal(isSkippableMapLocation('TBD'), true)
    assert.equal(isSkippableMapLocation('Port Canaveral, Florida'), false)
    assert.equal(isSkippableMapLocation('Magic Kingdom, Walt Disney World'), false)
  })

  it('aliases MIA car rental and Davenport onto the canonical places', () => {
    assert.equal(canonicalPlaceKey('MIA car rental'), 'miami international airport (mia)')
    assert.equal(canonicalPlaceKey('Davenport, Florida'), 'solterra resort, davenport')
    assert.equal(
      canonicalPlaceKey('Utopia of the Seas, Port Canaveral'),
      'port canaveral, florida',
    )
  })
})

describe('USA Mar 2027 itinerary map POIs', () => {
  it('builds Florida-region pins from the live seed itinerary', () => {
    const pois = extractTripMapPois(usa)
    const names = pois.map(p => p.name)
    assert.ok(names.some(n => /magic kingdom/i.test(n)))
    assert.ok(names.some(n => /animal kingdom/i.test(n)))
    assert.ok(names.some(n => /קנוורל|canaveral/i.test(n)))
    assert.ok(names.some(n => /cococay/i.test(n)))
    assert.ok(names.some(n => /miami beach/i.test(n)))
    assert.ok(names.some(n => /mia/i.test(n)))
    assert.ok(names.some(n => /solterra/i.test(n)))
    assert.ok(names.some(n => /holiday inn/i.test(n)))
    assert.equal(names.some(n => /נתב|gurion/i.test(n)), false)
    assert.equal(pois.some(p => /at sea/i.test(p.location)), false)
  })

  it('dedupes the same place across days', () => {
    const pois = extractTripMapPois(usa)
    const keys = pois.map(p => p.key)
    assert.equal(new Set(keys).size, keys.length)
    const mia = pois.find(p => p.key === 'miami international airport (mia)')
    assert.ok(mia)
    assert.ok((mia?.eventIds.length ?? 0) >= 2)
  })

  it('keeps real lat/lon in Florida / Bahamas, not Israel', () => {
    const pois = extractTripMapPois(usa)
    for (const poi of pois) {
      assert.ok(poi.coords.lat > 24 && poi.coords.lat < 31, poi.name)
      assert.ok(poi.coords.lon > -83 && poi.coords.lon < -76, poi.name)
    }
  })

  it('gives each pin a Hebrew blurb and a stable https link', () => {
    const pois = extractTripMapPois(usa)
    assert.ok(pois.length >= 7)
    for (const poi of pois) {
      assert.match(poi.blurb, HE)
      assert.ok(poi.blurb.length > 40, poi.name)
      assert.match(poi.linkUrl, /^https:\/\//)
    }
  })

  it('updates markers when an event location changes', () => {
    const before = extractTripMapPois(usa).map(p => p.key)
    assert.ok(before.includes('magic kingdom, walt disney world'))
    assert.equal(before.includes('cocoa beach, florida'), false)

    const edited = structuredClone(usa)
    const magic = edited.days
      .flatMap(d => d.events)
      .find(e => /magic kingdom/i.test(e.location ?? ''))
    assert.ok(magic)
    magic!.location = 'Cocoa Beach, Florida'
    delete magic!.coords

    const afterKeys = collectPlaceCandidates(edited).map(p => p.key)
    assert.equal(afterKeys.includes('magic kingdom, walt disney world'), false)
    assert.ok(afterKeys.includes('cocoa beach, florida'))
  })

  it('still collects TLV before region focus, then drops it for the Florida view', () => {
    const all = collectPlaceCandidates(usa)
    assert.ok(all.some(p => p.key === 'ben gurion t3'))
    const focused = extractTripMapPois(usa)
    assert.equal(focused.some(p => p.key === 'ben gurion t3'), false)
  })
})

describe('map page wiring does not leak family seeds', () => {
  it('Map.tsx reads the trip store and does not import usa-trip / familySeeds', () => {
    const page = readFileSync(join(root, 'src/pages/Map.tsx'), 'utf8')
    assert.equal(page.includes('familySeeds'), false)
    assert.equal(page.includes('usa-trip'), false)
    assert.ok(page.includes('useTripStore'))
    assert.ok(page.includes('מפה מצוירת'))
  })

  it('App restores /trip/:id/map instead of redirecting to itinerary', () => {
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
    assert.equal(app.includes('Navigate to="../itinerary"'), false)
    assert.ok(app.includes('path="map"'))
    assert.ok(app.includes("import('./pages/Map')"))
  })
})

describe('Family Profile is removed from the product UI', () => {
  it('deletes the FamilyProfile page', () => {
    assert.equal(existsSync(join(root, 'src/pages/FamilyProfile.tsx')), false)
  })

  it('redirects /profile bookmarks to Home', () => {
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8')
    assert.equal(app.includes('FamilyProfile'), false)
    assert.ok(app.includes('path="/profile"'))
    assert.match(app, /path="\/profile"[\s\S]*Navigate to="\/"/)
  })

  it('Home and trip chrome no longer link to /profile', () => {
    const home = readFileSync(join(root, 'src/pages/Home.tsx'), 'utf8')
    const layout = readFileSync(join(root, 'src/components/layout/AppLayout.tsx'), 'utf8')
    const dash = readFileSync(join(root, 'src/pages/Dashboard.tsx'), 'utf8')
    const chat = readFileSync(join(root, 'src/components/ai/AiChatDrawer.tsx'), 'utf8')
    assert.equal(home.includes('/profile'), false)
    assert.equal(home.includes('הפרופיל המשפחתי'), false)
    assert.equal(layout.includes('/profile'), false)
    assert.equal(dash.includes('/profile'), false)
    assert.equal(chat.includes('/profile'), false)
  })
})
