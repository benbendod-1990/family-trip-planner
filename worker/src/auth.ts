// Minimal request authentication.
// Two paths:
//  1. `x-api-secret: <SHARED_API_SECRET>` header  → dev/test convenience
//  2. `Authorization: Bearer <supabase-jwt>`      → production (HS256 JWT)

interface Env {
  SUPABASE_JWT_SECRET?: string
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
  if (!bearer || !env.SUPABASE_JWT_SECRET) return null

  const payload = await verifyHs256(bearer, env.SUPABASE_JWT_SECRET)
  if (!payload) return null
  const userId = typeof payload.sub === 'string' ? payload.sub : undefined
  if (!userId) return null
  return { kind: 'supabase-user', userId }
}

// Verifies a HS256 JWT and returns its payload, or null on failure.
async function verifyHs256(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const signed = enc.encode(`${headerB64}.${payloadB64}`)
  const sig = base64UrlToBytes(sigB64)
  const ok = await crypto.subtle.verify('HMAC', key, sig, signed)
  if (!ok) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64))) as Record<string, unknown>
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number' && payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
