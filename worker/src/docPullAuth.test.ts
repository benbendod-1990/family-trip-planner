import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { callerMayPullTripDoc } from './docPullAuth.ts'
import { emailFromJwtPayload } from './auth.ts'

describe('emailFromJwtPayload', () => {
  it('reads the Auth email claim only, never user_metadata', () => {
    assert.equal(emailFromJwtPayload({ email: 'benbendod@gmail.com' }), 'benbendod@gmail.com')
    assert.equal(
      emailFromJwtPayload({ user_metadata: { email: 'shechter.gal@gmail.com' } }),
      undefined,
    )
    assert.equal(emailFromJwtPayload({ sub: 'user-1' }), undefined)
    assert.equal(emailFromJwtPayload({ email: '   ' }), undefined)
  })
})

describe('callerMayPullTripDoc', () => {
  it('allows shared-secret and family-catalog emails, not Libi or a random owner', () => {
    assert.equal(callerMayPullTripDoc({ kind: 'shared-secret' }), true)
    assert.equal(
      callerMayPullTripDoc({ kind: 'supabase-user', userId: 'ben', email: 'benbendod@gmail.com' }),
      true,
    )
    assert.equal(
      callerMayPullTripDoc({ kind: 'supabase-user', userId: 'gal', email: 'Shechter.gal@gmail.com' }),
      true,
    )
    assert.equal(
      callerMayPullTripDoc({ kind: 'supabase-user', userId: 'libi', email: 'Edenbendavid1992@gmail.com' }),
      false,
    )
    assert.equal(
      callerMayPullTripDoc({ kind: 'supabase-user', userId: 'owner-without-email' }),
      false,
    )
  })
})
