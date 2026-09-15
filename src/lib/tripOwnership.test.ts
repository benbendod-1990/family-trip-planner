import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
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
