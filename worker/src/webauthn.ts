// Server-side WebAuthn for passport downloads.
//
// The client Face ID prompt is not authorization. The Worker issues a
// challenge, verifies the assertion (origin + rpIdHash + UV + signature)
// against a stored public key, then either mints a 2-minute URL or opens a
// 10-minute unlock window so the owner can open several scans without
// tapping Face ID twelve times.

import { bytesToBase64Url, base64UrlToBytes } from './auth.ts'
import { bytesEq, decodeCbor, encodeCbor, mapGet, type CborValue } from './cbor.ts'

export const CHALLENGE_TTL_SEC = 5 * 60
export const UNLOCK_TTL_SEC = 10 * 60
export const WEBAUTHN_REQUIRED = 'webauthn_required'

export interface SupabaseEnv {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export interface WebAuthnAssertionBody {
  id?: unknown
  rawId?: unknown
  type?: unknown
  response?: {
    clientDataJSON?: unknown
    authenticatorData?: unknown
    signature?: unknown
    attestationObject?: unknown
    userHandle?: unknown
  }
}

interface CredentialRow {
  id: string
  user_id: string
  credential_id: string
  public_key: JsonWebKey
  cose_alg: number
  sign_count: number
}

export interface ChallengeResult {
  challenge: string
  rpId: string
  rpName: string
  purpose: 'register' | 'assert'
  timeout: number
  user: { id: string; name: string; displayName: string }
  allowCredentials: Array<{ type: 'public-key'; id: string; transports?: string[] }>
}

export function originIsAllowed(origin: string | null, allowed: string): origin is string {
  if (!origin) return false
  const list = allowed.split(',').map(s => s.trim()).filter(Boolean)
  return list.includes('*') || list.includes(origin)
}

export function rpIdFromOrigin(origin: string): string {
  return new URL(origin).hostname
}

export function requirePassportWebAuthn(params: {
  kind: string
  unlockValid: boolean
  assertionVerified: boolean
}): { ok: true } | { status: number; error: string; detail: string } {
  if (params.kind !== 'passport') return { ok: true }
  if (params.unlockValid || params.assertionVerified) return { ok: true }
  return { status: 403, error: WEBAUTHN_REQUIRED, detail: 'passport_assertion_required' }
}

export async function issueWebAuthnChallenge(
  env: SupabaseEnv,
  userId: string,
  email: string | undefined,
  origin: string,
  requestedPurpose?: unknown,
): Promise<ChallengeResult | { error: string; detail?: string; status: number }> {
  const creds = await listCredentials(env, userId)
  const purpose: 'register' | 'assert' =
    requestedPurpose === 'register' || requestedPurpose === 'assert'
      ? requestedPurpose
      : creds.length === 0 ? 'register' : 'assert'
  const challengeBytes = new Uint8Array(32)
  crypto.getRandomValues(challengeBytes)
  const challenge = bytesToBase64Url(challengeBytes)
  const stored = await restInsert(env, 'webauthn_challenges', {
    user_id: userId,
    challenge,
    purpose,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_SEC * 1000).toISOString(),
  })
  if (!stored.ok) {
    return { error: 'server_misconfigured', detail: stored.detail, status: 500 }
  }
  const rpId = rpIdFromOrigin(origin)
  const name = email || userId
  return {
    challenge,
    rpId,
    rpName: 'Family Trip Planner',
    purpose,
    timeout: 60_000,
    user: { id: bytesToBase64Url(userHandle(userId)), name, displayName: name },
    allowCredentials: creds.map(c => ({ type: 'public-key' as const, id: c.credential_id, transports: ['internal'] })),
  }
}

export async function registerWebAuthnCredential(
  env: SupabaseEnv,
  userId: string,
  origin: string,
  body: WebAuthnAssertionBody,
): Promise<{ ok: true } | { error: string; detail?: string; status: number }> {
  const parsed = decodeCredential(body)
  if ('error' in parsed) return parsed
  const client = parseClientData(parsed.clientDataJSON, origin, 'webauthn.create')
  if ('error' in client) return client
  const consumed = await consumeChallenge(env, userId, client.challenge, 'register')
  if (!('ok' in consumed)) return consumed
  const att = parsed.attestationObject
  if (!att) return { error: 'bad_request', detail: 'attestationObject required', status: 400 }
  const extracted = extractAttestedCredential(att)
  if ('error' in extracted) return extracted
  if ((extracted.flags & 0x01) === 0 || (extracted.flags & 0x04) === 0) {
    return { error: 'unauthorized', detail: 'user verification required', status: 401 }
  }
  if (!(await rpIdHashMatches(extracted.authData, rpIdFromOrigin(origin)))) {
    return { error: 'unauthorized', detail: 'rpId mismatch', status: 401 }
  }
  const inserted = await restInsert(env, 'webauthn_credentials', {
    user_id: userId,
    credential_id: bytesToBase64Url(extracted.credentialId),
    public_key: extracted.jwk,
    cose_alg: extracted.alg,
    sign_count: extracted.signCount,
    transports: ['internal'],
  })
  if (!inserted.ok) {
    return { error: 'register_failed', detail: inserted.detail, status: 502 }
  }
  await touchUnlock(env, userId)
  return { ok: true }
}

export async function assertWebAuthn(
  env: SupabaseEnv,
  userId: string,
  origin: string,
  body: WebAuthnAssertionBody,
): Promise<{ ok: true } | { error: string; detail?: string; status: number }> {
  const verified = await verifyStoredAssertion(env, userId, origin, body)
  if ('error' in verified) return verified
  await touchUnlock(env, userId)
  return { ok: true }
}

export async function verifyStoredAssertion(
  env: SupabaseEnv,
  userId: string,
  origin: string,
  body: WebAuthnAssertionBody,
): Promise<{ ok: true } | { error: string; detail?: string; status: number }> {
  const parsed = decodeCredential(body)
  if ('error' in parsed) return parsed
  if (!parsed.authenticatorData || !parsed.signature) {
    return { error: 'bad_request', detail: 'assertion response required', status: 400 }
  }
  const client = parseClientData(parsed.clientDataJSON, origin, 'webauthn.get')
  if ('error' in client) return client
  const consumed = await consumeChallenge(env, userId, client.challenge, 'assert')
  if (!('ok' in consumed)) return consumed
  const credId = bytesToBase64Url(parsed.rawId)
  const row = await getCredential(env, userId, credId)
  if (!row) return { error: 'unauthorized', detail: 'unknown_credential', status: 401 }
  const auth = parseAuthenticatorData(parsed.authenticatorData)
  if ('error' in auth) return auth
  const rpId = rpIdFromOrigin(origin)
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)))
  if (!bytesEq(auth.rpIdHash, rpHash)) {
    return { error: 'unauthorized', detail: 'rpId mismatch', status: 401 }
  }
  if ((auth.flags & 0x01) === 0 || (auth.flags & 0x04) === 0) {
    return { error: 'unauthorized', detail: 'user verification required', status: 401 }
  }
  const ok = await verifyAssertionSignature(
    row.public_key,
    row.cose_alg,
    parsed.authenticatorData,
    parsed.clientDataJSON,
    parsed.signature,
  )
  if (!ok) return { error: 'unauthorized', detail: 'bad_signature', status: 401 }
  if (row.sign_count > 0 && auth.signCount > 0 && auth.signCount <= row.sign_count) {
    return { error: 'unauthorized', detail: 'cloned_authenticator', status: 401 }
  }
  if (auth.signCount > row.sign_count) {
    await restPatchCredentialSignCount(env, row.id, auth.signCount)
  }
  return { ok: true }
}

export async function hasUnlock(env: SupabaseEnv, userId: string): Promise<boolean> {
  const r = await restRpc<boolean>(env, 'has_webauthn_unlock', { _user_id: userId })
  return r === true
}

export async function touchUnlock(env: SupabaseEnv, userId: string): Promise<void> {
  await restRpc(env, 'touch_webauthn_unlock', { _user_id: userId, _ttl_seconds: UNLOCK_TTL_SEC })
}

export function parseClientData(
  clientDataJSON: Uint8Array,
  expectedOrigin: string,
  expectedType: 'webauthn.create' | 'webauthn.get',
): { challenge: string } | { error: string; detail?: string; status: number } {
  let parsed: { type?: unknown; challenge?: unknown; origin?: unknown }
  try {
    parsed = JSON.parse(new TextDecoder().decode(clientDataJSON)) as typeof parsed
  } catch {
    return { error: 'bad_request', detail: 'clientDataJSON', status: 400 }
  }
  if (parsed.type !== expectedType) {
    return { error: 'unauthorized', detail: 'clientData type', status: 401 }
  }
  if (typeof parsed.origin !== 'string' || parsed.origin !== expectedOrigin) {
    return { error: 'unauthorized', detail: 'origin mismatch', status: 401 }
  }
  if (typeof parsed.challenge !== 'string' || !parsed.challenge) {
    return { error: 'bad_request', detail: 'challenge missing', status: 400 }
  }
  return { challenge: parsed.challenge }
}

export function extractAttestedCredential(
  attestationObject: Uint8Array,
): {
  credentialId: Uint8Array
  jwk: JsonWebKey
  alg: number
  signCount: number
  flags: number
  authData: Uint8Array
} | { error: string; detail?: string; status: number } {
  let decoded: CborValue
  try {
    decoded = decodeCbor(attestationObject)
  } catch {
    return { error: 'bad_request', detail: 'attestationObject', status: 400 }
  }
  if (!(decoded instanceof Map)) return { error: 'bad_request', detail: 'attestationObject map', status: 400 }
  const authDataVal = mapGet(decoded, 'authData')
  if (!(authDataVal instanceof Uint8Array)) {
    return { error: 'bad_request', detail: 'authData', status: 400 }
  }
  const auth = parseAuthenticatorData(authDataVal)
  if ('error' in auth) return auth
  if (!auth.credentialId || !auth.credentialPublicKey) {
    return { error: 'bad_request', detail: 'attested credential missing', status: 400 }
  }
  const cose = coseToJwk(auth.credentialPublicKey)
  if ('error' in cose) return cose
  return {
    credentialId: auth.credentialId,
    jwk: cose.jwk,
    alg: cose.alg,
    signCount: auth.signCount,
    flags: auth.flags,
    authData: authDataVal,
  }
}

export async function rpIdHashMatches(authData: Uint8Array, rpId: string): Promise<boolean> {
  const auth = parseAuthenticatorData(authData)
  if ('error' in auth) return false
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)))
  return bytesEq(auth.rpIdHash, rpHash)
}

export function parseAuthenticatorData(
  data: Uint8Array,
): {
  rpIdHash: Uint8Array
  flags: number
  signCount: number
  credentialId?: Uint8Array
  credentialPublicKey?: Uint8Array
} | { error: string; detail?: string; status: number } {
  if (data.length < 37) return { error: 'bad_request', detail: 'authenticatorData too short', status: 400 }
  const rpIdHash = data.subarray(0, 32)
  const flags = data[32]!
  const signCount = (data[33]! << 24) | (data[34]! << 16) | (data[35]! << 8) | data[36]!
  const at = (flags & 0x40) !== 0
  if (!at) return { rpIdHash, flags, signCount }
  if (data.length < 55) return { error: 'bad_request', detail: 'attestedCredentialData', status: 400 }
  const credIdLen = (data[53]! << 8) | data[54]!
  const credIdStart = 55
  const credIdEnd = credIdStart + credIdLen
  if (data.length < credIdEnd) return { error: 'bad_request', detail: 'credentialId', status: 400 }
  return {
    rpIdHash,
    flags,
    signCount,
    credentialId: data.subarray(credIdStart, credIdEnd),
    credentialPublicKey: data.subarray(credIdEnd),
  }
}

export function coseToJwk(
  coseBytes: Uint8Array,
): { jwk: JsonWebKey; alg: number } | { error: string; detail?: string; status: number } {
  let decoded: CborValue
  try {
    decoded = decodeCbor(coseBytes)
  } catch {
    return { error: 'bad_request', detail: 'cose key', status: 400 }
  }
  if (!(decoded instanceof Map)) return { error: 'bad_request', detail: 'cose map', status: 400 }
  const kty = mapGet(decoded, 1)
  const alg = mapGet(decoded, 3)
  if (typeof alg !== 'number') return { error: 'bad_request', detail: 'cose alg', status: 400 }
  if (kty === 2 && alg === -7) {
    const x = mapGet(decoded, -2)
    const y = mapGet(decoded, -3)
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
      return { error: 'bad_request', detail: 'cose xy', status: 400 }
    }
    return {
      alg,
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: bytesToBase64Url(x),
        y: bytesToBase64Url(y),
      },
    }
  }
  if (kty === 3 && alg === -257) {
    const n = mapGet(decoded, -1)
    const e = mapGet(decoded, -2)
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) {
      return { error: 'bad_request', detail: 'cose rsa', status: 400 }
    }
    return {
      alg,
      jwk: {
        kty: 'RSA',
        n: bytesToBase64Url(n),
        e: bytesToBase64Url(e),
      },
    }
  }
  return { error: 'bad_request', detail: `unsupported cose alg ${String(alg)}`, status: 400 }
}

export function encodeCoseEs256(x: Uint8Array, y: Uint8Array): Uint8Array {
  const map = new Map<CborValue, CborValue>([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, x],
    [-3, y],
  ])
  return encodeCbor(map)
}

export function encodeAttestationObject(authData: Uint8Array): Uint8Array {
  const map = new Map<CborValue, CborValue>([
    ['fmt', 'none'],
    ['attStmt', new Map()],
    ['authData', authData],
  ])
  return encodeCbor(map)
}

export async function verifyAssertionSignature(
  jwk: JsonWebKey,
  alg: number,
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON as BufferSource))
  const signed = concat(authenticatorData, clientHash)
  try {
    if (alg === -7 || jwk.kty === 'EC') {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      )
      const raw = derEcdsaToRaw(signature)
      return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw as BufferSource, signed as BufferSource)
    }
    if (alg === -257 || jwk.kty === 'RSA') {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n, e: jwk.e },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as BufferSource, signed as BufferSource)
    }
  } catch {
    return false
  }
  return false
}

/** WebAuthn ECDSA signatures are ASN.1 DER; WebCrypto wants raw r||s. */
export function derEcdsaToRaw(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der
  if (der[0] !== 0x30) throw new Error('ecdsa: not DER')
  let offset = 1
  const seqLen = der[offset++]!
  if (seqLen & 0x80) offset += seqLen & 0x7f
  if (der[offset++] !== 0x02) throw new Error('ecdsa: r')
  const rLen = der[offset++]!
  const r = der.subarray(offset, offset + rLen)
  offset += rLen
  if (der[offset++] !== 0x02) throw new Error('ecdsa: s')
  const sLen = der[offset++]!
  const s = der.subarray(offset, offset + sLen)
  return concat(pad32(r), pad32(s))
}

export function rawEcdsaToDer(raw: Uint8Array): Uint8Array {
  if (raw.length !== 64) throw new Error('ecdsa: raw must be 64 bytes')
  const r = stripLeadingZeros(raw.subarray(0, 32))
  const s = stripLeadingZeros(raw.subarray(32, 64))
  const body = concat(new Uint8Array([0x02, r.length]), r, new Uint8Array([0x02, s.length]), s)
  return concat(new Uint8Array([0x30, body.length]), body)
}

function pad32(n: Uint8Array): Uint8Array {
  let start = 0
  while (start < n.length - 1 && n[start] === 0) start++
  const stripped = n.subarray(start)
  if (stripped.length > 32) throw new Error('ecdsa: integer too large')
  const out = new Uint8Array(32)
  out.set(stripped, 32 - stripped.length)
  return out
}

function stripLeadingZeros(n: Uint8Array): Uint8Array {
  let i = 0
  while (i < n.length - 1 && n[i] === 0) i++
  const rest = n.subarray(i)
  if (rest[0]! & 0x80) return concat(new Uint8Array([0]), rest)
  return rest
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function userHandle(userId: string): Uint8Array {
  const src = new TextEncoder().encode(userId)
  const out = new Uint8Array(Math.min(src.length, 64))
  out.set(src.subarray(0, out.length))
  return out
}

function decodeCredential(body: WebAuthnAssertionBody): {
  rawId: Uint8Array
  clientDataJSON: Uint8Array
  authenticatorData?: Uint8Array
  signature?: Uint8Array
  attestationObject?: Uint8Array
} | { error: string; detail?: string; status: number } {
  const rawId = asB64(body.rawId) ?? asB64(body.id)
  const clientDataJSON = asB64(body.response?.clientDataJSON)
  if (!rawId || !clientDataJSON) {
    return { error: 'bad_request', detail: 'credential id + clientDataJSON required', status: 400 }
  }
  return {
    rawId,
    clientDataJSON,
    authenticatorData: asB64(body.response?.authenticatorData),
    signature: asB64(body.response?.signature),
    attestationObject: asB64(body.response?.attestationObject),
  }
}

function asB64(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string' || !value) return undefined
  try {
    return base64UrlToBytes(value)
  } catch {
    return undefined
  }
}

async function consumeChallenge(
  env: SupabaseEnv,
  userId: string,
  challenge: string,
  purpose: 'register' | 'assert',
): Promise<{ ok: true } | { error: string; detail?: string; status: number }> {
  const ok = await restRpc<boolean>(env, 'consume_webauthn_challenge', {
    _user_id: userId,
    _challenge: challenge,
    _purpose: purpose,
  })
  if (ok !== true) {
    return { error: 'unauthorized', detail: 'challenge invalid or expired', status: 401 }
  }
  return { ok: true }
}

async function listCredentials(env: SupabaseEnv, userId: string): Promise<CredentialRow[]> {
  const rows = await restSelect<CredentialRow>(
    env,
    `webauthn_credentials?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,credential_id,public_key,cose_alg,sign_count`,
  )
  return rows ?? []
}

async function getCredential(env: SupabaseEnv, userId: string, credentialId: string): Promise<CredentialRow | null> {
  const rows = await restSelect<CredentialRow>(
    env,
    `webauthn_credentials?user_id=eq.${encodeURIComponent(userId)}&credential_id=eq.${encodeURIComponent(credentialId)}&select=id,user_id,credential_id,public_key,cose_alg,sign_count&limit=1`,
  )
  return rows?.[0] ?? null
}

async function restPatchCredentialSignCount(env: SupabaseEnv, id: string, signCount: number): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/webauthn_credentials?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: restHeaders(env, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ sign_count: signCount }),
    },
  )
}

async function restInsert(
  env: SupabaseEnv,
  table: string,
  row: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, detail: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set' }
  }
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: restHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { ok: false, detail: txt.slice(0, 300) }
  }
  return { ok: true }
}

async function restSelect<T>(env: SupabaseEnv, path: string): Promise<T[] | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: restHeaders(env),
  })
  if (!res.ok) return null
  return (await res.json()) as T[]
}

async function restRpc<T>(env: SupabaseEnv, fn: string, body: Record<string, unknown>): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null
  const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: restHeaders(env),
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

function restHeaders(env: SupabaseEnv, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export function buildAuthenticatorData(opts: {
  rpIdHash: Uint8Array
  flags: number
  signCount: number
  credentialId?: Uint8Array
  credentialPublicKey?: Uint8Array
}): Uint8Array {
  const count = new Uint8Array(4)
  new DataView(count.buffer).setUint32(0, opts.signCount)
  const parts = [opts.rpIdHash, new Uint8Array([opts.flags]), count]
  if (opts.credentialId && opts.credentialPublicKey) {
    const aaguid = new Uint8Array(16)
    const len = new Uint8Array(2)
    new DataView(len.buffer).setUint16(0, opts.credentialId.length)
    parts.push(aaguid, len, opts.credentialId, opts.credentialPublicKey)
  }
  return concat(...parts)
}
