import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GUEST_TRIP_STORE_KEY,
  planTripStoreAccountSwitch,
  tripStorePersistName,
} from './tripStoreScope.ts'

const HOLLAND_ID = '34980c90-bd66-4270-8d45-3e96787b07ef'
const USA_ID = 'b38fc010-9096-45c9-b8df-191e369143dc'
const STALE_GUEST_DEMOS = [HOLLAND_ID, USA_ID, 'paris', 'crete', 'rome']

type Cache = Map<string, string[]>

function applySwitch(
  caches: Cache,
  previousUserId: string | null,
  nextUserId: string | null,
  currentIds: string[],
): { userId: string | null; ids: string[] } {
  caches.set(tripStorePersistName(previousUserId), currentIds)
  const nextName = tripStorePersistName(nextUserId)
  const plan = planTripStoreAccountSwitch(previousUserId, nextUserId, caches.has(nextName))
  if (plan.resetTo === 'noop') return { userId: nextUserId, ids: currentIds }
  if (plan.resetTo === 'rehydrate') return { userId: nextUserId, ids: caches.get(nextName) ?? [] }
  caches.set(nextName, [])
  return { userId: nextUserId, ids: [] }
}

describe('sign-out / account switch does not leak prior trips', () => {
  it('user B does not see user A USA, and sign-out does not keep A’s trips or USA', () => {
    const caches: Cache = new Map()
    // Stale pre-fix guest key still holds every demo plus the signed-in USA view.
    caches.set(GUEST_TRIP_STORE_KEY, [...STALE_GUEST_DEMOS])

    let userId: string | null = null
    let ids = [...STALE_GUEST_DEMOS]

    ;({ userId, ids } = applySwitch(caches, userId, 'user-a', ids))
    ids = [USA_ID]
    caches.set(tripStorePersistName('user-a'), ids)
    assert.deepEqual(ids, [USA_ID])
    assert.ok(caches.has(tripStorePersistName('user-a')))

    ;({ userId, ids } = applySwitch(caches, userId, 'user-b', ids))
    assert.equal(userId, 'user-b')
    assert.deepEqual(ids, [])
    assert.deepEqual(caches.get(tripStorePersistName('user-a')), [USA_ID])

    ;({ userId, ids } = applySwitch(caches, userId, null, ids))
    assert.equal(userId, null)
    assert.deepEqual(ids, [])
    assert.equal(ids.includes(USA_ID), false)
    assert.equal(ids.includes(HOLLAND_ID), false)

    ;({ userId, ids } = applySwitch(caches, userId, 'user-a', ids))
    assert.deepEqual(ids, [USA_ID])
    assert.equal(ids.includes(HOLLAND_ID), false)
  })

  it('does not rehydrate the stale guest key on sign-out even if it exists', () => {
    const plan = planTripStoreAccountSwitch('user-a', null, true)
    assert.equal(plan.resetTo, 'guest-empty')
    assert.equal(plan.persistName, GUEST_TRIP_STORE_KEY)
  })
})
