import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

  it('turns 403 family-catalog denial into GmailForbiddenError, not reconnect', () => {
    assert.throws(
      () => throwForGmailBrokerStatus(403, '{"error":"forbidden"}'),
      (err: unknown) => {
        assert.equal((err as Error).name, 'GmailForbiddenError')
        assert.match((err as Error).message, /בן וגל/)
        assert.equal((err as Error).message.includes('Gmail token broker'), false)
        return true
      },
    )
  })

  it('persists the Gmail readonly scope, not a login-time hardcoded string', () => {
    const text = readFileSync(new URL('./gmailToken.ts', import.meta.url), 'utf8')
    assert.match(text, /GMAIL_READONLY_SCOPE/)
    assert.equal(text.includes("'https://www.googleapis.com/auth/gmail.readonly'"), false)
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
