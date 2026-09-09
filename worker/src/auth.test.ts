import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { authenticate, verifyJwt, jwkForImport, bytesToBase64Url } from './auth.ts'

const enc = new TextEncoder()

function b64urlJson(obj: unknown): string {
  return bytesToBase64Url(enc.encode(JSON.stringify(obj)))
}

async function es256Pair() {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
}

async function signEs256(
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
  kid = 'test-kid',
): Promise<string> {
  const header = b64urlJson({ alg: 'ES256', typ: 'JWT', kid })
  const body = b64urlJson(payload)
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      enc.encode(`${header}.${body}`),
    ),
  )
  return `${header}.${body}.${bytesToBase64Url(sig)}`
}

async function signHs256(secret: string, payload: Record<string, unknown>): Promise<string> {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' })
  const body = b64urlJson(payload)
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`)),
  )
  return `${header}.${body}.${bytesToBase64Url(sig)}`
}

describe('worker JWT verify', () => {
  it('accepts a valid ES256 token with a sanitized JWKS-shaped key', async () => {
    const { privateKey, publicKey } = await es256Pair()
    const now = Math.floor(Date.now() / 1000)
    const token = await signEs256(privateKey, { sub: 'user-1', exp: now + 3600, iat: now })
    const jwk = {
      ...(await crypto.subtle.exportKey('jwk', publicKey)),
      kid: 'test-kid',
      use: 'sig',
      alg: 'ES256',
      ext: true,
      key_ops: ['verify'],
    }
    const result = await verifyJwt(token, {}, { jwk, nowSec: now })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.payload.sub, 'user-1')
  })

  it('reports expired_token instead of a generic invalid when exp has passed', async () => {
    const { privateKey, publicKey } = await es256Pair()
    const now = Math.floor(Date.now() / 1000)
    const token = await signEs256(privateKey, { sub: 'user-1', exp: now - 120, iat: now - 4000 })
    const jwk = await crypto.subtle.exportKey('jwk', publicKey)
    const result = await verifyJwt(token, {}, { jwk, nowSec: now })
    assert.deepEqual(result, { ok: false, detail: 'expired_token' })
  })

  it('allows a token within the 60s clock-skew window', async () => {
    const { privateKey, publicKey } = await es256Pair()
    const now = Math.floor(Date.now() / 1000)
    const token = await signEs256(privateKey, { sub: 'user-1', exp: now - 30, iat: now - 4000 })
    const jwk = await crypto.subtle.exportKey('jwk', publicKey)
    const result = await verifyJwt(token, {}, { jwk, nowSec: now })
    assert.equal(result.ok, true)
  })

  it('accepts HS256 when the legacy JWT secret is set', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await signHs256('super-secret', { sub: 'user-hs', exp: now + 60 })
    const result = await verifyJwt(token, { SUPABASE_JWT_SECRET: 'super-secret' }, { nowSec: now })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.payload.sub, 'user-hs')
  })

  it('rejects a token signed with the wrong key', async () => {
    const a = await es256Pair()
    const b = await es256Pair()
    const now = Math.floor(Date.now() / 1000)
    const token = await signEs256(a.privateKey, { sub: 'user-1', exp: now + 60 })
    const jwk = await crypto.subtle.exportKey('jwk', b.publicKey)
    const result = await verifyJwt(token, {}, { jwk, nowSec: now })
    assert.deepEqual(result, { ok: false, detail: 'invalid_token' })
  })

  it('jwkForImport drops JWKS-only fields', () => {
    const stripped = jwkForImport({
      kty: 'EC',
      crv: 'P-256',
      x: 'aa',
      y: 'bb',
      kid: 'x',
      use: 'sig',
      alg: 'ES256',
      ext: true,
      key_ops: ['verify'],
    } as JsonWebKey)
    assert.deepEqual(stripped, { kty: 'EC', crv: 'P-256', x: 'aa', y: 'bb' })
  })
})

describe('authenticate()', () => {
  it('returns missing_bearer with no Authorization header', async () => {
    const req = new Request('https://example.com/api/gmail/access-token', { method: 'POST' })
    const result = await authenticate(req, {})
    assert.deepEqual(result, { ok: false, detail: 'missing_bearer' })
  })

  it('accepts the shared-secret path without a JWT', async () => {
    const req = new Request('https://example.com/api/docs/pull', {
      method: 'POST',
      headers: { 'x-api-secret': 'dev-secret' },
    })
    const result = await authenticate(req, { SHARED_API_SECRET: 'dev-secret' })
    assert.deepEqual(result, { ok: true, caller: { kind: 'shared-secret' } })
  })

  it('does not treat a wrong shared secret as authenticated', async () => {
    const req = new Request('https://example.com/api/docs/pull', {
      method: 'POST',
      headers: { 'x-api-secret': 'nope' },
    })
    const result = await authenticate(req, { SHARED_API_SECRET: 'dev-secret' })
    assert.deepEqual(result, { ok: false, detail: 'missing_bearer' })
  })
})
