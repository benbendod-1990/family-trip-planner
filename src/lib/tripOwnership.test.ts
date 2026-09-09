import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isTripOwnerRole, userIsTripOwner } from './tripOwnership.ts'

describe('trip owner role', () => {
  it('treats owner and admin as allowed, members as not', () => {
    assert.equal(isTripOwnerRole('owner'), true)
    assert.equal(isTripOwnerRole('admin'), true)
    assert.equal(isTripOwnerRole('member'), false)
    assert.equal(isTripOwnerRole(undefined), false)
    assert.equal(userIsTripOwner(null, [{ user_id: 'a', role: 'owner' }]), false)
    assert.equal(userIsTripOwner('a', [{ user_id: 'a', role: 'owner' }]), true)
    assert.equal(userIsTripOwner('a', [{ user_id: 'a', role: 'member' }]), false)
    assert.equal(userIsTripOwner('b', [{ user_id: 'a', role: 'owner' }]), false)
  })
})

describe('Doc sync-check is owner-only', () => {
  it('TripDocCard gates checkDocSync and the link form on isOwner', () => {
    const card = readFileSync(new URL('../components/dashboard/TripDocCard.tsx', import.meta.url), 'utf8')
    assert.ok(card.includes('useIsTripOwner'))
    assert.ok(card.includes('if (!isOwner) return'))
    assert.ok(card.includes('בדוק סנכרון מול המסמך'))
    assert.ok(card.includes('isOwner ? ('))
    assert.ok(card.includes('רק יוצר הטיול יכול לבדוק סנכרון'))
    assert.ok(card.includes('OpenDoc'))
    assert.equal(card.includes('familySeeds'), false)
  })

  it('the owner hook reads list_trip_members via listTripMembers', () => {
    const hook = readFileSync(new URL('../hooks/useIsTripOwner.ts', import.meta.url), 'utf8')
    assert.ok(hook.includes('listTripMembers'))
    assert.ok(hook.includes('userIsTripOwner'))
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    assert.equal(home.includes('listTripMembers'), false)
    assert.equal(home.includes('useIsTripOwner'), false)
  })
})
