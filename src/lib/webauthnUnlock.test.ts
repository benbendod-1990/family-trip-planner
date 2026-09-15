import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  authenticatorCopy,
  isUnlockValid,
  makeUnlockRecord,
  UNLOCK_TTL_MS,
} from './webauthnUnlock.ts'

describe('WebAuthn unlock copy', () => {
  it('never claims Face ID when WebAuthn is missing', () => {
    const copy = authenticatorCopy({ webauthn: false, platformUv: null })
    assert.equal(copy.method, 'unavailable')
    assert.equal(/Face ID/.test(copy.body), false)
    assert.match(copy.body, /לא נציג את קובץ הדרכון/)
  })

  it('names platform biometrics only when UVPA is true', () => {
    const copy = authenticatorCopy({ webauthn: true, platformUv: true })
    assert.equal(copy.method, 'platform-biometric')
    assert.match(copy.body, /Face ID/)
  })

  it('falls back to device credential and says it is not Face ID', () => {
    const copy = authenticatorCopy({ webauthn: true, platformUv: false })
    assert.equal(copy.method, 'device-credential')
    assert.match(copy.body, /זה לא Face ID/)
    assert.equal(copy.title.includes('Face ID'), false)
  })
})

describe('sensitive unlock session', () => {
  it('expires after the configured TTL and is bound to the user', () => {
    const now = 1_000_000
    const rec = makeUnlockRecord('user-a', now)
    assert.equal(rec.until, now + UNLOCK_TTL_MS)
    assert.equal(isUnlockValid(rec, 'user-a', now + 60_000), true)
    assert.equal(isUnlockValid(rec, 'user-b', now + 60_000), false)
    assert.equal(isUnlockValid(rec, 'user-a', rec.until), false)
    assert.equal(isUnlockValid(null, 'user-a', now), false)
    assert.equal(UNLOCK_TTL_MS >= 5 * 60 * 1000, true)
    assert.equal(UNLOCK_TTL_MS <= 15 * 60 * 1000, true)
  })
})
