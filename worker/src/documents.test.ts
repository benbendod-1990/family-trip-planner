import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { signDocumentUrl } from './documents.ts'
import { requirePassportWebAuthn, WEBAUTHN_REQUIRED } from './webauthn.ts'

const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' }
const originCtx = {
  origin: 'https://family-trip-planner-end.pages.dev',
  allowedOrigin: 'http://localhost:3002,https://family-trip-planner-end.pages.dev',
}

describe('document sign endpoint', () => {
  it('requires a user session, not the shared-secret path', async () => {
    const r = await signDocumentUrl(
      env,
      { kind: 'shared-secret' },
      { documentId: '34980c90-bd66-4270-8d45-3e96787b07ef' },
      originCtx,
    )
    assert.equal('error' in r, true)
    if ('error' in r) {
      assert.equal(r.status, 401)
      assert.equal(r.error, 'unauthorized')
    }
  })

  it('rejects a non-uuid document id before talking to Storage', async () => {
    const r = await signDocumentUrl(
      env,
      { kind: 'supabase-user', userId: 'user-1' },
      { documentId: '../other-trip/secret.pdf' },
      originCtx,
    )
    assert.equal('error' in r, true)
    if ('error' in r) {
      assert.equal(r.status, 400)
      assert.equal(r.error, 'bad_request')
    }
  })

  it('does not mint a passport URL without a WebAuthn assertion or unlock', () => {
    const gate = requirePassportWebAuthn({
      kind: 'passport',
      unlockValid: false,
      assertionVerified: false,
    })
    assert.equal('ok' in gate, false)
    if (!('ok' in gate)) {
      assert.equal(gate.status, 403)
      assert.equal(gate.error, WEBAUTHN_REQUIRED)
    }
  })
})
