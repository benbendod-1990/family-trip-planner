import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GmailAuthError, throwForGmailBrokerStatus } from './gmailAuthError.ts'

describe('Gmail broker error mapping', () => {
  it('turns 401 unauthorized into GmailAuthError, never a raw broker string', () => {
    assert.throws(
      () => throwForGmailBrokerStatus(401, '{"error":"unauthorized"}'),
      (err: unknown) => {
        assert.equal(err instanceof GmailAuthError, true)
        assert.equal((err as Error).name, 'GmailAuthError')
        assert.match((err as Error).message, /התחבר מחדש/)
        assert.equal((err as Error).message.includes('Gmail token broker'), false)
        assert.equal((err as Error).message.includes('unauthorized'), false)
        return true
      },
    )
  })

  it('turns 412 missing refresh token into the same reconnect error', () => {
    assert.throws(
      () => throwForGmailBrokerStatus(412, '{"error":"no_refresh_token"}'),
      (err: unknown) => err instanceof GmailAuthError,
    )
  })

  it('keeps non-auth broker failures as generic errors', () => {
    assert.throws(
      () => throwForGmailBrokerStatus(502, '{"error":"google_token_error"}'),
      (err: unknown) => {
        assert.equal(err instanceof GmailAuthError, false)
        assert.match((err as Error).message, /Gmail token broker 502/)
        return true
      },
    )
  })
})
