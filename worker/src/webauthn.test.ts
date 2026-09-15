import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bytesToBase64Url } from './auth.ts'
import { decodeCbor, encodeCbor, mapGet } from './cbor.ts'
import {
  buildAuthenticatorData,
  derEcdsaToRaw,
  encodeAttestationObject,
  encodeCoseEs256,
  extractAttestedCredential,
  originIsAllowed,
  parseAuthenticatorData,
  parseClientData,
  rawEcdsaToDer,
  requirePassportWebAuthn,
  rpIdFromOrigin,
  verifyAssertionSignature,
  WEBAUTHN_REQUIRED,
} from './webauthn.ts'

const ORIGIN = 'https://family-trip-planner-end.pages.dev'
const RP_ID = 'family-trip-planner-end.pages.dev'
const ALLOWED = 'http://localhost:3002,https://family-trip-planner-end.pages.dev'

async function es256Pair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>
}

async function jwkXy(publicKey: CryptoKey): Promise<{ x: Uint8Array; y: Uint8Array; jwk: JsonWebKey }> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey) as JsonWebKey
  const pad = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const b64 = (s: string) => {
    const bin = atob(pad(s))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return { x: b64(jwk.x!), y: b64(jwk.y!), jwk }
}

describe('WebAuthn origin / rpId', () => {
  it('accepts only listed origins and derives rpId from the hostname', () => {
    assert.equal(originIsAllowed(ORIGIN, ALLOWED), true)
    assert.equal(originIsAllowed('http://localhost:3002', ALLOWED), true)
    assert.equal(originIsAllowed('https://evil.example', ALLOWED), false)
    assert.equal(originIsAllowed(null, ALLOWED), false)
    assert.equal(rpIdFromOrigin(ORIGIN), RP_ID)
  })
})

describe('passport sign gate', () => {
  it('lets regular docs through without an assertion', () => {
    const r = requirePassportWebAuthn({ kind: 'photo', unlockValid: false, assertionVerified: false })
    assert.deepEqual(r, { ok: true })
  })

  it('403s a passport without unlock or assertion', () => {
    const r = requirePassportWebAuthn({ kind: 'passport', unlockValid: false, assertionVerified: false })
    assert.equal('ok' in r, false)
    if (!('ok' in r)) {
      assert.equal(r.status, 403)
      assert.equal(r.error, WEBAUTHN_REQUIRED)
    }
  })

  it('accepts a verified assertion or a live unlock for passports', () => {
    assert.deepEqual(
      requirePassportWebAuthn({ kind: 'passport', unlockValid: true, assertionVerified: false }),
      { ok: true },
    )
    assert.deepEqual(
      requirePassportWebAuthn({ kind: 'passport', unlockValid: false, assertionVerified: true }),
      { ok: true },
    )
  })
})

describe('CBOR + attestation extract', () => {
  it('round-trips a COSE ES256 key out of a none attestation', async () => {
    const { publicKey } = await es256Pair()
    const { x, y, jwk } = await jwkXy(publicKey)
    const cose = encodeCoseEs256(x, y)
    const decoded = decodeCbor(cose)
    assert.equal(decoded instanceof Map, true)
    if (decoded instanceof Map) {
      assert.equal(mapGet(decoded, 1), 2)
      assert.equal(mapGet(decoded, 3), -7)
    }
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RP_ID)))
    const credId = new Uint8Array(16)
    crypto.getRandomValues(credId)
    const authData = buildAuthenticatorData({
      rpIdHash,
      flags: 0x45, // UP | UV | AT
      signCount: 1,
      credentialId: credId,
      credentialPublicKey: cose,
    })
    const att = encodeAttestationObject(authData)
    const extracted = extractAttestedCredential(att)
    assert.equal('error' in extracted, false)
    if ('error' in extracted) return
    assert.equal(extracted.alg, -7)
    assert.equal(extracted.jwk.x, jwk.x)
    assert.equal(extracted.jwk.y, jwk.y)
    assert.equal(bytesToBase64Url(extracted.credentialId), bytesToBase64Url(credId))
    assert.equal(extracted.flags & 0x04, 0x04)
  })
})

describe('assertion signature', () => {
  it('verifies a DER ECDSA signature over authenticatorData || clientDataHash', async () => {
    const { privateKey, publicKey } = await es256Pair()
    const { jwk } = await jwkXy(publicKey)
    const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RP_ID)))
    const authData = buildAuthenticatorData({ rpIdHash, flags: 0x05, signCount: 2 })
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({
      type: 'webauthn.get',
      challenge: 'abc',
      origin: ORIGIN,
    }))
    const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON))
    const signed = new Uint8Array(authData.length + clientHash.length)
    signed.set(authData, 0)
    signed.set(clientHash, authData.length)
    const rawSig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signed))
    const der = rawEcdsaToDer(rawSig)
    assert.equal(der[0], 0x30)
    assert.equal(derEcdsaToRaw(der).length, 64)
    const ok = await verifyAssertionSignature(jwk, -7, authData, clientDataJSON, der)
    assert.equal(ok, true)
    const tampered = new Uint8Array(der)
    tampered[tampered.length - 1] ^= 0xff
    const nok = await verifyAssertionSignature(jwk, -7, authData, clientDataJSON, tampered)
    assert.equal(nok, false)
  })

  it('rejects clientData from the wrong origin or type', () => {
    const json = new TextEncoder().encode(JSON.stringify({
      type: 'webauthn.get',
      challenge: 'abc',
      origin: 'https://evil.example',
    }))
    const r = parseClientData(json, ORIGIN, 'webauthn.get')
    assert.equal('error' in r, true)
    if ('error' in r) assert.equal(r.status, 401)
  })

  it('requires UV on authenticator flags', () => {
    const data = buildAuthenticatorData({
      rpIdHash: new Uint8Array(32),
      flags: 0x01, // UP only
      signCount: 0,
    })
    const parsed = parseAuthenticatorData(data)
    assert.equal('error' in parsed, false)
    if ('error' in parsed) return
    assert.equal(parsed.flags & 0x04, 0)
  })
})

describe('cbor maps', () => {
  it('encodes and decodes mixed int keys', () => {
    const map = new Map<unknown, unknown>([[1, 2], [3, -7], [-2, new Uint8Array([1, 2])]])
    const bytes = encodeCbor(map as never)
    const back = decodeCbor(bytes)
    assert.equal(back instanceof Map, true)
  })
})
