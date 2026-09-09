import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripPlan } from '../types/trip-plan.ts'
import type { TripDocument } from '../types/trip-plan.ts'
import { CANONICAL_SEED_IDENTITIES } from './dedupeDemoTrips.ts'
import {
  dropPrivateFamilySeedsFromGuest,
  dropUnauthorizedDemoSeeds,
  guestSafeSeeds,
  hydrateGuestTrips,
  isUnauthorizedDemoSeed,
  localTripsSafeToAutoPush,
  remoteTripIds,
  resolveActiveTripId,
} from './authTripSync.ts'
import { ensureSeedDocLinks, USA_PLANNING_DOC_TITLE, USA_PLANNING_DOC_URL, USA_TRIP_ID } from './seedDocLink.ts'
import {
  GUEST_TRIP_STORE_KEY,
  planTripStoreAccountSwitch,
  tripStorePersistName,
} from './tripStoreScope.ts'

const HOLLAND_ID = '34980c90-bd66-4270-8d45-3e96787b07ef'
const PARIS_ID = 'a1f4e9b2-3c8d-4e6a-9b7c-1d5e8f7a2b34'
const CRETE_ID = 'b2c5f8a3-4d9e-4f1b-8c6a-7e2d5b9f3a18'
const ROME_ID = '30a5d517-0db3-427f-adfa-92ef125e1f8f'
const USA_ID = USA_TRIP_ID
const DEMO_IDS = [HOLLAND_ID, PARIS_ID, CRETE_ID, ROME_ID, USA_ID]

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

function usa(overrides: Partial<TripPlan> = {}): TripPlan {
  return stub({
    id: USA_ID,
    name: 'ארה״ב — מרץ 2027',
    destination: 'פלורידה, ארה״ב',
    startDate: '2027-03-19',
    endDate: '2027-04-02',
    coverEmoji: '🇺🇸',
    ...overrides,
  })
}

function allDemoStubs(): TripPlan[] {
  return CANONICAL_SEED_IDENTITIES.map(s => stub({ ...s, coverEmoji: '🧳' }))
}

/** Same composition wireUp uses before foldRemoteTrips (union remote-only). */
function visibleAfterCloudPull(local: TripPlan[], remote: TripPlan[]): TripPlan[] {
  const remoteIds = remoteTripIds(remote)
  const kept = dropUnauthorizedDemoSeeds(local, remoteIds)
  const have = new Set(kept.map(t => t.id))
  return [...kept, ...remote.filter(t => !have.has(t.id))]
}

describe('guest catalog has no private family seeds', () => {
  it('production guest seeds are empty and do not include USA', () => {
    const demoData = readFileSync(new URL('../data/demoData.ts', import.meta.url), 'utf8')
    assert.match(demoData, /export const GUEST_TRIPS: TripPlan\[\] = \[\]/)
    assert.equal(guestSafeSeeds(allDemoStubs()).length, 0)
    assert.equal(guestSafeSeeds(allDemoStubs()).some(t => t.id === USA_ID), false)
  })

  it('empty guest store does not receive USA or other family seeds', () => {
    const { trips, replacedCatalog } = hydrateGuestTrips([], allDemoStubs())
    assert.equal(replacedCatalog, true)
    assert.deepEqual(trips, [])
    for (const id of DEMO_IDS) {
      assert.equal(trips.some(t => t.id === id), false)
    }
  })

  it('strips a cached USA trip (and other family seeds) from guest persist', () => {
    const custom = stub({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'טיול שלי',
      destination: 'ליסבון',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
    })
    const { trips, droppedIds } = hydrateGuestTrips([...allDemoStubs(), custom], [])
    assert.equal(trips.some(t => t.id === USA_ID), false)
    assert.equal(trips.some(t => t.id === HOLLAND_ID), false)
    assert.deepEqual(trips.map(t => t.id), [custom.id])
    assert.ok(droppedIds.includes(USA_ID))
    assert.ok(droppedIds.includes(HOLLAND_ID))
  })

  it('dropPrivateFamilySeedsFromGuest removes USA even next to a user trip', () => {
    const custom = stub({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      name: 'טיול חדש',
      destination: 'יוון',
      startDate: '2026-06-01',
      endDate: '2026-06-08',
    })
    const { trips, droppedIds } = dropPrivateFamilySeedsFromGuest([usa(), custom])
    assert.deepEqual(trips.map(t => t.id), [custom.id])
    assert.deepEqual(droppedIds, [USA_ID])
  })

  it('replaces the legacy Italy demo with an empty guest catalog, not USA', () => {
    const italy = stub({
      id: 'demo-italy-2026',
      name: 'איטליה',
      destination: 'רומא',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
    })
    const { trips, replacedCatalog } = hydrateGuestTrips([italy], allDemoStubs())
    assert.equal(replacedCatalog, true)
    assert.equal(trips.some(t => t.id === 'demo-italy-2026'), false)
    assert.equal(trips.some(t => t.id === USA_ID), false)
    assert.equal(trips.length, 0)
  })
})

describe('authenticated member sees only RLS-returned USA', () => {
  it('treats Holland/Paris/Crete/Rome as unauthorized when remote is USA only', () => {
    const remoteIds = new Set([USA_ID])
    assert.equal(isUnauthorizedDemoSeed(HOLLAND_ID, remoteIds), true)
    assert.equal(isUnauthorizedDemoSeed(PARIS_ID, remoteIds), true)
    assert.equal(isUnauthorizedDemoSeed(CRETE_ID, remoteIds), true)
    assert.equal(isUnauthorizedDemoSeed(ROME_ID, remoteIds), true)
    assert.equal(isUnauthorizedDemoSeed(USA_ID, remoteIds), false)
  })

  it('Home list after cloud pull is only USA, including documents', () => {
    const booking: TripDocument = {
      id: 'usa-doc-1',
      filename: 'LY17.pdf',
      path: 'external:https://example.com/ly17',
      mimeType: 'text/uri-list',
      size: 0,
      kind: 'flight',
      addedAt: '2026-09-07T00:00:00.000Z',
      url: 'https://example.com/ly17',
    }
    const local = allDemoStubs().map(t =>
      t.id === USA_ID ? usa({ documents: [booking] }) : t,
    )
    const remote = [usa({ documents: [booking], updatedAt: '2026-09-08T00:00:00.000Z' })]
    const visible = visibleAfterCloudPull(local, remote)
    assert.equal(visible.length, 1)
    assert.equal(visible[0].id, USA_ID)
    assert.equal(visible[0].documents?.[0]?.id, 'usa-doc-1')
    for (const id of [HOLLAND_ID, PARIS_ID, CRETE_ID, ROME_ID]) {
      assert.equal(visible.some(t => t.id === id), false)
    }
  })

  it('adds a remote-only authorized trip the local cache did not have', () => {
    const local = allDemoStubs().filter(t => t.id !== USA_ID)
    const visible = visibleAfterCloudPull(local, [usa()])
    assert.deepEqual(visible.map(t => t.id), [USA_ID])
  })

  it('restores the USA planning Doc after a cloud-only hydrate that omitted docUrl', () => {
    // Invitee persist starts empty (PR #10). Cloud USA has no doc_url column,
    // so the row arrives without docUrl. Seed restore must still attach it.
    const visible = visibleAfterCloudPull([], [usa({ updatedAt: '2026-09-08T00:00:00.000Z' })])
    assert.equal(visible[0]?.docUrl, undefined)
    const withDoc = ensureSeedDocLinks(visible)
    assert.equal(withDoc[0]?.id, USA_ID)
    assert.equal(withDoc[0]?.docUrl, USA_PLANNING_DOC_URL)
    assert.equal(withDoc[0]?.docTitle, USA_PLANNING_DOC_TITLE)
  })

  it('keeps a user-created local trip that is not a canonical seed', () => {
    const custom = stub({
      id: '11111111-2222-3333-4444-555555555555',
      name: 'טיול חדש',
      destination: 'יוון',
      startDate: '2026-06-01',
      endDate: '2026-06-08',
    })
    const visible = visibleAfterCloudPull([...allDemoStubs(), custom], [usa()])
    assert.equal(visible.some(t => t.id === USA_ID), true)
    assert.equal(visible.some(t => t.id === custom.id), true)
    assert.equal(visible.some(t => t.id === HOLLAND_ID), false)
  })

  it('clears activeTripId when it pointed at an unauthorized demo seed', () => {
    const visible = [usa()]
    assert.equal(resolveActiveTripId(visible, HOLLAND_ID), USA_ID)
    assert.equal(resolveActiveTripId(visible, USA_ID), USA_ID)
    assert.equal(resolveActiveTripId([], HOLLAND_ID), null)
  })
})

describe('no auto-push of unauthorized demo seeds', () => {
  it('does not auto-push any canonical seed the RLS read omitted', () => {
    const local = allDemoStubs()
    const remoteIds = new Set([USA_ID])
    const pushable = localTripsSafeToAutoPush(local, remoteIds)
    assert.deepEqual(pushable, [])
  })

  it('does not auto-push canonical seeds even when the cloud list is empty', () => {
    // First login on a new account: guest catalog is sitting in memory, but
    // save_trip would claim Holland/Paris/Crete/Rome/USA UUIDs.
    const pushable = localTripsSafeToAutoPush(allDemoStubs(), new Set())
    assert.deepEqual(pushable, [])
  })

  it('still auto-pushes a user-created trip that is not a seed', () => {
    const custom = stub({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      name: 'טיול שלי',
      destination: 'ליסבון',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
    })
    const pushable = localTripsSafeToAutoPush([...allDemoStubs(), custom], new Set([USA_ID]))
    assert.deepEqual(pushable.map(t => t.id), [custom.id])
  })
})

describe('account-scoped persist keys', () => {
  it('uses a distinct key per user and a guest key without a suffix', () => {
    assert.equal(tripStorePersistName(null), GUEST_TRIP_STORE_KEY)
    assert.equal(tripStorePersistName('user-a'), `${GUEST_TRIP_STORE_KEY}:user-a`)
    assert.notEqual(tripStorePersistName('user-a'), tripStorePersistName('user-b'))
  })

  it('sign-out resets to an empty guest catalog instead of rehydrating a stale shared key', () => {
    const plan = planTripStoreAccountSwitch('user-a', null, true)
    assert.equal(plan.persistName, GUEST_TRIP_STORE_KEY)
    assert.equal(plan.resetTo, 'guest-empty')
  })

  it('a new user starts empty so the previous account’s USA cannot leak', () => {
    const toB = planTripStoreAccountSwitch('user-a', 'user-b', false)
    assert.equal(toB.persistName, tripStorePersistName('user-b'))
    assert.equal(toB.resetTo, 'empty')
  })

  it('returning to the same user rehydrates their own cache only', () => {
    const back = planTripStoreAccountSwitch(null, 'user-a', true)
    assert.equal(back.persistName, tripStorePersistName('user-a'))
    assert.equal(back.resetTo, 'rehydrate')
  })
})

describe('call-site regressions', () => {
  it('wireUp restores seed Doc links after the cloud merge', () => {
    const text = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    assert.ok(text.includes('ensureSeedDocLinks'))
    assert.ok(text.includes('ensureSeedBookingDocuments'))
  })

  it('wireUp no longer pushes every local-only trip', () => {
    const text = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    assert.equal(text.includes('pushLocalToRemote(localOnly)'), false)
    assert.ok(text.includes('localTripsSafeToAutoPush'))
    assert.ok(text.includes('dropUnauthorizedDemoSeeds'))
    assert.ok(text.includes('switchTripStoreAccount'))
  })

  it('manual sync and realtime also drop unauthorized demo seeds', () => {
    const cloud = readFileSync(new URL('../components/cloud/CloudSyncButton.tsx', import.meta.url), 'utf8')
    const realtime = readFileSync(new URL('./tripRealtime.ts', import.meta.url), 'utf8')
    assert.ok(cloud.includes('dropUnauthorizedDemoSeeds'))
    assert.ok(realtime.includes('dropUnauthorizedDemoSeeds'))
  })

  it('Home has a guest login CTA and no family-seed loaders', () => {
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    assert.equal(home.includes('DEMO_TRIPS'), false)
    assert.equal(home.includes('FAMILY_SEED_TRIPS'), false)
    assert.equal(home.includes("from '@/data/familySeeds'"), false)
    assert.equal(home.includes("from '@/data/demoData'"), false)
    assert.equal(/usa-trip\.json/.test(home), false)
    assert.equal(home.includes(USA_ID), false)
    assert.equal(home.includes('allowDemoLoaders'), false)
    assert.equal(home.includes('טען '), false)
    assert.ok(home.includes("navigate('/login')"))
    assert.ok(home.includes('הטיולים המשפחתיים זמינים רק אחרי התחברות עם Google'))
    assert.ok(home.includes('!session && !authLoading'))
  })

  it('guest persist path never statically imports family seed JSON', () => {
    const demoData = readFileSync(new URL('../data/demoData.ts', import.meta.url), 'utf8')
    const store = readFileSync(new URL('../stores/tripStore.ts', import.meta.url), 'utf8')
    const auth = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    assert.equal(/usa-trip/.test(demoData), false)
    assert.equal(/holland-trip/.test(demoData), false)
    assert.ok(demoData.includes('GUEST_TRIPS'))
    assert.equal(store.includes("from '@/data/familySeeds'"), false)
    assert.equal(/usa-trip\.json/.test(store), false)
    assert.ok(store.includes("import('@/lib/repairLiveSeedTrips')"))
    assert.ok(store.includes('hydrateGuestTrips'))
    assert.ok(store.includes('GUEST_TRIPS'))
    assert.ok(auth.includes("import('@/data/familySeeds')"))
    assert.equal(auth.includes("import('@/data/demoData')"), false)
  })

  it('authenticated seed-repair helpers still know the USA trip id', () => {
    const seeds = readFileSync(new URL('../data/familySeeds.ts', import.meta.url), 'utf8')
    assert.ok(seeds.includes('usa-trip.json'))
    assert.ok(seeds.includes('FAMILY_SEED_TRIPS'))
    const auth = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    assert.ok(auth.includes('FAMILY_SEED_TRIPS'))
    assert.ok(auth.includes('ensureSeedBookingDocuments(merged, FAMILY_SEED_TRIPS)'))
  })

  it('does not re-enable in-app AI product UI', () => {
    const flag = readFileSync(new URL('./aiFeatures.ts', import.meta.url), 'utf8')
    assert.ok(flag.includes('AI_PRODUCT_UI_ENABLED: boolean = false'))
  })

  it('PWA precache skips the family seed itinerary chunk', () => {
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
    assert.ok(vite.includes("globIgnores: ['**/familySeeds-*.js']"))
  })
})
