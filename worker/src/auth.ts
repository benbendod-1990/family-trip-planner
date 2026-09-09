// Request authentication.
// Two paths:
//  1. `x-api-secret: <SHARED_API_SECRET>` header → dev/test convenience
//  2. `Authorization: Bearer <supabase-jwt>`    → production (ES256 via JWKS,
//     with /auth/v1/user as a fallback so a JWKS/crypto miss doesn't 401 a
//     still-valid session)

interface Env {
  SUPABASE_URL?: string
  SUPABASE_JWT_SECRET?: string // legacy HS256 fallback, kept for older projects
  SUPABASE_ANON_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SHARED_API_SECRET?: string
}

export interface AuthedCaller {
  kind: 'shared-secret' | 'supabase-user'
  userId?: string
}

export type AuthFailReason = 'missing_bearer' | 'expired_token' | 'invalid_token'

export type AuthOutcome =
  | { ok: true; caller: AuthedCaller }
  | { ok: false; detail: AuthFailReason }

/** 60s leeway: iPhone clocks vs Worker, and tokens that expire mid-request. */
const EXP_SKEW_SEC = 60

export async function authenticate(req: Request, env: Env): Promise<AuthOutcome> {
  const shared = req.headers.get('x-api-secret')
  if (env.SHARED_API_SECRET && shared && shared === env.SHARED_API_SECRET) {
    return { ok: true, caller: { kind: 'shared-secret' } }
  }

  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!bearer) return { ok: false, detail: 'missing_bearer' }

  const verified = await verifyJwt(bearer, env)
  if (verified.ok) {
    const userId = typeof verified.payload.sub === 'string' ? verified.payload.sub : undefined
    if (!userId) return { ok: false, detail: 'invalid_token' }
    return { ok: true, caller: { kind: 'supabase-user', userId } }
  }

  // Homemade JWKS verify failed. Ask Supabase Auth — it knows the project's
  // current signing keys. Skipped for expired tokens: Auth would reject those
  // too, and the extra hop wouldn't help.
  if (verified.detail !== 'expired_token') {
    const viaAuth = await verifyViaAuthApi(bearer, env)
    if (viaAuth) {
      return { ok: true, caller: { kind: 'supabase-user', userId: viaAuth } }
    }
  }

  return { ok: false, detail: verified.detail }
}

type VerifyResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; detail: 'expired_token' | 'invalid_token' }

export async function verifyJwt(
  token: string,
  env: Env,
  opts?: { nowSec?: number; jwk?: JsonWebKey },
): Promise<VerifyResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, detail: 'invalid_token' }
  const [headerB64, payloadB64, sigB64] = parts

  let header: { alg?: string; kid?: string }
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64)))
  } catch {
    return { ok: false, detail: 'invalid_token' }
  }

  const enc = new TextEncoder()
  const signedBytes = enc.encode(`${headerB64}.${payloadB64}`)
  const sigBytes = base64UrlToBytes(sigB64)

  let valid = false
  try {
    if (header.alg === 'HS256') {
      if (!env.SUPABASE_JWT_SECRET) return { ok: false, detail: 'invalid_token' }
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(env.SUPABASE_JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      valid = await crypto.subtle.verify('HMAC', key, sigBytes, signedBytes)
    } else if (header.alg === 'ES256' || header.alg === 'RS256') {
      const jwk = opts?.jwk ?? (env.SUPABASE_URL && header.kid
        ? await getJwk(env.SUPABASE_URL, header.kid)
        : null)
      if (!jwk) return { ok: false, detail: 'invalid_token' }
      const importAlgo =
        header.alg === 'ES256'
          ? { name: 'ECDSA', namedCurve: 'P-256' }
          : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      const verifyAlgo =
        header.alg === 'ES256'
          ? { name: 'ECDSA', hash: { name: 'SHA-256' } }
          : { name: 'RSASSA-PKCS1-v1_5' }
      const key = await crypto.subtle.importKey(
        'jwk',
        jwkForImport(jwk, header.alg),
        importAlgo,
        false,
        ['verify'],
      )
      valid = await crypto.subtle.verify(verifyAlgo, key, sigBytes, signedBytes)
    } else {
      return { ok: false, detail: 'invalid_token' }
    }
  } catch {
    return { ok: false, detail: 'invalid_token' }
  }

  if (!valid) return { ok: false, detail: 'invalid_token' }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64))) as Record<string, unknown>
    const now = opts?.nowSec ?? Math.floor(Date.now() / 1000)
    if (typeof payload.nbf === 'number' && payload.nbf - EXP_SKEW_SEC > now) {
      return { ok: false, detail: 'invalid_token' }
    }
    if (typeof payload.exp === 'number' && payload.exp + EXP_SKEW_SEC < now) {
      return { ok: false, detail: 'expired_token' }
    }
    return { ok: true, payload }
  } catch {
    return { ok: false, detail: 'invalid_token' }
  }
}

/**
 * Strip JWKS-only fields (`kid`, `use`, `alg`, `ext`, `key_ops`). Some WebCrypto
 * implementations reject the combination of `use` + `key_ops` on import, which
 * would 401 every signed-in user.
 */
export function jwkForImport(jwk: JsonWebKey, alg?: string): JsonWebKey {
  if (jwk.kty === 'EC') {
    return { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y }
  }
  if (jwk.kty === 'RSA') {
    return { kty: 'RSA', n: jwk.n, e: jwk.e }
  }
  if (alg === 'ES256') {
    return { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y }
  }
  return jwk
}

async function verifyViaAuthApi(token: string, env: Env): Promise<string | null> {
  const apiKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!env.SUPABASE_URL || !apiKey) return null
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: apiKey,
      },
    })
    if (!res.ok) return null
    const user = (await res.json()) as { id?: unknown }
    return typeof user.id === 'string' ? user.id : null
  } catch {
    return null
  }
}

// Module-level JWKS cache. Cloudflare reuses isolates across requests, so this
// avoids an HTTP round-trip per call. Refreshes after JWKS_TTL_MS or on cache miss.
const JWKS_TTL_MS = 60 * 60 * 1000 // 1h
let jwksCache: { url: string; fetchedAt: number; keys: Record<string, JsonWebKey> } | null = null

async function getJwk(supabaseUrl: string, kid: string): Promise<JsonWebKey | null> {
  const jwksUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
  const fresh =
    jwksCache && jwksCache.url === jwksUrl && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS
  if (!fresh) {
    const keys = await fetchJwks(jwksUrl)
    if (!keys) return null
    jwksCache = { url: jwksUrl, fetchedAt: Date.now(), keys }
  }
  // First-attempt miss: maybe key was rotated. Force-refresh once.
  if (jwksCache && !jwksCache.keys[kid]) {
    const keys = await fetchJwks(jwksUrl)
    if (!keys) return null
    jwksCache = { url: jwksUrl, fetchedAt: Date.now(), keys }
  }
  return jwksCache?.keys[kid] ?? null
}

async function fetchJwks(jwksUrl: string): Promise<Record<string, JsonWebKey> | null> {
  try {
    const res = await fetch(jwksUrl)
    if (!res.ok) return null
    const data = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> }
    const keys: Record<string, JsonWebKey> = {}
    for (const k of data.keys ?? []) {
      if (k.kid) keys[k.kid] = k
    }
    return keys
  } catch {
    return null
  }
}

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
