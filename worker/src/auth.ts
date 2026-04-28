// Request authentication.
// Two paths:
//  1. `x-api-secret: <SHARED_API_SECRET>` header → dev/test convenience
//  2. `Authorization: Bearer <supabase-jwt>`    → production (ES256 via JWKS)

interface Env {
  SUPABASE_URL?: string
  SUPABASE_JWT_SECRET?: string // legacy HS256 fallback, kept for older projects
  SHARED_API_SECRET?: string
}

export interface AuthedCaller {
  kind: 'shared-secret' | 'supabase-user'
  userId?: string
}

export async function authenticate(req: Request, env: Env): Promise<AuthedCaller | null> {
  const shared = req.headers.get('x-api-secret')
  if (env.SHARED_API_SECRET && shared && shared === env.SHARED_API_SECRET) {
    return { kind: 'shared-secret' }
  }

  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!bearer) return null

  const payload = await verifyJwt(bearer, env)
  if (!payload) return null

  const userId = typeof payload.sub === 'string' ? payload.sub : undefined
  if (!userId) return null
  return { kind: 'supabase-user', userId }
}

async function verifyJwt(token: string, env: Env): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts

  let header: { alg?: string; kid?: string }
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerB64)))
  } catch {
    return null
  }

  const enc = new TextEncoder()
  const signedBytes = enc.encode(`${headerB64}.${payloadB64}`)
  const sigBytes = base64UrlToBytes(sigB64)

  let valid = false
  if (header.alg === 'HS256') {
    if (!env.SUPABASE_JWT_SECRET) return null
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(env.SUPABASE_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    valid = await crypto.subtle.verify('HMAC', key, sigBytes, signedBytes)
  } else if (header.alg === 'ES256' || header.alg === 'RS256') {
    if (!env.SUPABASE_URL || !header.kid) return null
    const jwk = await getJwk(env.SUPABASE_URL, header.kid)
    if (!jwk) return null
    const importAlgo =
      header.alg === 'ES256'
        ? { name: 'ECDSA', namedCurve: 'P-256' }
        : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
    const verifyAlgo =
      header.alg === 'ES256'
        ? { name: 'ECDSA', hash: 'SHA-256' }
        : { name: 'RSASSA-PKCS1-v1_5' }
    const key = await crypto.subtle.importKey('jwk', jwk, importAlgo, false, ['verify'])
    valid = await crypto.subtle.verify(verifyAlgo, key, sigBytes, signedBytes)
  } else {
    return null
  }

  if (!valid) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64))) as Record<string, unknown>
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number' && payload.exp < now) return null
    return payload
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
    const res = await fetch(jwksUrl)
    if (!res.ok) return null
    const data = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> }
    const keys: Record<string, JsonWebKey> = {}
    for (const k of data.keys ?? []) {
      if (k.kid) keys[k.kid] = k
    }
    jwksCache = { url: jwksUrl, fetchedAt: Date.now(), keys }
  }
  // First-attempt miss: maybe key was rotated. Force-refresh once.
  if (jwksCache && !jwksCache.keys[kid]) {
    const res = await fetch(jwksUrl)
    if (!res.ok) return null
    const data = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> }
    const keys: Record<string, JsonWebKey> = {}
    for (const k of data.keys ?? []) {
      if (k.kid) keys[k.kid] = k
    }
    jwksCache = { url: jwksUrl, fetchedAt: Date.now(), keys }
  }
  return jwksCache?.keys[kid] ?? null
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
