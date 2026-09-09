import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { itineraryGridColumns, itineraryDaysTemplate, itineraryIsSingleColumn, sortDayEvents, ratingStars } from './itineraryLayout.ts'
import { getTripDuration, formatDateHe } from './date.ts'

describe('itineraryGridColumns', () => {
  it('uses a definite 1/2/3 count so auto-fit cannot freeze long trips', () => {
    assert.equal(itineraryGridColumns(true, true), 1)
    assert.equal(itineraryGridColumns(false, true), 2)
    assert.equal(itineraryGridColumns(false, false), 3)
  })
})

describe('itineraryDaysTemplate', () => {
  it('uses minmax(0, 1fr) so 1fr cannot lock to min-content on WebKit', () => {
    assert.equal(itineraryDaysTemplate(1), 'repeat(1, minmax(0, 1fr))')
    assert.equal(itineraryDaysTemplate(3), 'repeat(3, minmax(0, 1fr))')
    assert.equal(itineraryIsSingleColumn(1), true)
    assert.equal(itineraryIsSingleColumn(2), false)
  })

  it('does not emit auto-fit / naked 1fr tracks', () => {
    for (const n of [1, 2, 3]) {
      const t = itineraryDaysTemplate(n)
      assert.equal(t.includes('auto-fit'), false)
      assert.equal(t.includes('minmax(0, 1fr)'), true)
      assert.equal(/\b1fr\b/.test(t.replaceAll('minmax(0, 1fr)', '')), false)
    }
  })
})

describe('Itinerary page does not use myk-library Grid', () => {
  it('keeps day layout local so 1fr-minmax(auto) cannot sneak back in', () => {
    const src = readFileSync(new URL('../pages/Itinerary.tsx', import.meta.url), 'utf8')
    assert.equal(src.includes('DaysGrid'), true)
    assert.equal(/\{[^}]*\bGrid\b[^}]*\}\s*from 'myk-library'/.test(src), false)
    assert.equal(src.includes('itineraryDaysTemplate'), true)
  })
})

describe('AppLayout keeps chrome while itinerary loads', () => {
  it('nests Suspense around Outlet instead of letting App unmount the shell', () => {
    const src = readFileSync(new URL('../components/layout/AppLayout.tsx', import.meta.url), 'utf8')
    assert.equal(src.includes('<Outlet />'), true)
    assert.equal(src.includes('PageErrorBoundary'), true)
    assert.equal(/Suspense fallback=\{<RouteFallback/.test(src.replace(/\s+/g, ' ')), true)
  })
})

describe('PWA update path', () => {
  it('auto-activates a waiting worker instead of waiting for a tap on a hung page', () => {
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
    assert.equal(vite.includes("registerType: 'autoUpdate'"), true)
    assert.equal(vite.includes('skipWaiting: true'), true)
    const prompt = readFileSync(new URL('../components/pwa/PwaUpdatePrompt.tsx', import.meta.url), 'utf8')
    assert.equal(prompt.includes('registration.update()'), true)
    assert.equal(prompt.includes('pageshow'), true)
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
      for (const event of day.events as Array<{ startTime?: string }>) {
        assert.equal(typeof event.startTime, 'string', `${day.date} events need startTime`)
      }
    }
  })
})

describe('sortDayEvents', () => {
  const unsafeCompare = (a: { startTime?: string }, b: { startTime?: string }) =>
    a.startTime!.localeCompare(b.startTime!)

  /** WebKit-like: compare every pair in both directions. V8 TimSort often does not. */
  function allPairsSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
    const out = arr.slice()
    for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue
        cmp(out[i], out[j])
      }
    }
    return out
  }

  it('does not throw when events or startTime are missing (the iPhone sort throw)', () => {
    assert.deepEqual(sortDayEvents(undefined), [])
    assert.deepEqual(sortDayEvents(null), [])
    const mixed = [
      { id: 'b', startTime: '09:00' },
      { id: 'a' },
      { id: 'c', startTime: '08:00' },
    ]
    assert.deepEqual(sortDayEvents(mixed).map(e => e.id), ['a', 'c', 'b'])
    assert.doesNotThrow(() => allPairsSort(mixed, (a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')))
  })

  it('the previous localeCompare-on-startTime comparator throws on a WebKit-style all-pairs pass', () => {
    const mixed = [{ startTime: '09:00' }, {}]
    assert.throws(
      () => allPairsSort(mixed, unsafeCompare),
      (err: unknown) => err instanceof TypeError,
    )
  })
})

describe('ratingStars', () => {
  it('never calls String.repeat with a non-integer', () => {
    assert.equal(ratingStars(undefined), '')
    assert.equal(ratingStars(-1), '')
    assert.equal(ratingStars(3.7), '⭐⭐⭐⭐')
    assert.equal(ratingStars(2), '⭐⭐')
  })
})

describe('formatDateHe does not throw on junk dates', () => {
  it('returns the input string instead of RangeError', () => {
    assert.equal(formatDateHe('not-a-date'), 'not-a-date')
  })
})

describe('DayColumn does not mount myk-library Timeline', () => {
  it('uses a local event list so a 15-day trip cannot throw inside Timeline on WebKit', () => {
    const src = readFileSync(new URL('../components/itinerary/DayColumn.tsx', import.meta.url), 'utf8')
    assert.equal(src.includes('sortDayEvents'), true)
    assert.equal(/\{[^}]*\bTimeline\b[^}]*\}\s*from 'myk-library'/.test(src), false)
    assert.equal(src.includes('<Timeline'), false)
  })
})

describe('Itinerary past-visits access is optional', () => {
  it('does not call visits.filter without optional chaining', () => {
    const src = readFileSync(new URL('../pages/Itinerary.tsx', import.meta.url), 'utf8')
    assert.equal(src.includes('destMemory?.visits?.filter'), true)
    assert.equal(src.includes('destMemory?.visits.filter'), false)
  })
})
