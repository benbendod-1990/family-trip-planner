import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { signDocumentUrl } from './documents.ts'

describe('document sign endpoint', () => {
  it('requires a user session, not the shared-secret path', async () => {
    const r = await signDocumentUrl(
      { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' },
      { kind: 'shared-secret' },
      { documentId: '34980c90-bd66-4270-8d45-3e96787b07ef' },
    )
    assert.equal('error' in r, true)
    if ('error' in r) {
      assert.equal(r.status, 401)
      assert.equal(r.error, 'unauthorized')
    }
  })

  it('rejects a non-uuid document id before talking to Storage', async () => {
    const r = await signDocumentUrl(
      { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' },
      { kind: 'supabase-user', userId: 'user-1' },
      { documentId: '../other-trip/secret.pdf' },
    )
    assert.equal('error' in r, true)
    if ('error' in r) {
      assert.equal(r.status, 400)
      assert.equal(r.error, 'bad_request')
    }
  })
})
