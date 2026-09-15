// Mint short-TTL signed URLs for trip files after a membership check.
//
// Neither bucket has a SELECT policy for authenticated users — createSignedUrl
// from the browser cannot work. The Worker uses the service role only on the
// server (never in the client). Regular files: ≤15 min after JWT + membership.
// Passports: 2 min after JWT + trip-owner locator + a server-verified WebAuthn
// assertion (or a 10-minute unlock minted by that assertion).

import type { AuthedCaller } from './auth.ts'
import {
  assertWebAuthn,
  hasUnlock,
  originIsAllowed,
  requirePassportWebAuthn,
  type WebAuthnAssertionBody,
} from './webauthn.ts'

const SENSITIVE_BUCKET = 'trip-sensitive-documents'
const REGULAR_BUCKET = 'trip-documents'
const SENSITIVE_TTL_SEC = 120
const REGULAR_TTL_SEC = 15 * 60

interface SupabaseEnv {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface LocatorRow {
  document_id: string
  trip_id: string
  kind: string
  path: string
  storage_bucket: string
  filename: string
  mime_type: string
}

export async function signDocumentUrl(
  env: SupabaseEnv,
  caller: AuthedCaller,
  body: { documentId?: unknown; assertion?: WebAuthnAssertionBody },
  ctx: { origin: string | null; allowedOrigin: string },
): Promise<
  | { signed_url: string; expires_in: number; expires_at: string; filename: string; mime_type: string }
  | { error: string; detail?: string; status: number }
> {
  if (caller.kind !== 'supabase-user' || !caller.userId) {
    return { error: 'unauthorized', detail: 'user session required', status: 401 }
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'server_misconfigured', detail: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set', status: 500 }
  }
  const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
    return { error: 'bad_request', detail: 'documentId uuid required', status: 400 }
  }

  const row = await locateDocument(env, documentId, caller.userId)
  if (!row) {
    return { error: 'not_found', detail: 'no file for this member', status: 404 }
  }

  const sensitive = row.kind === 'passport'
  const bucket = row.storage_bucket
    || (sensitive ? SENSITIVE_BUCKET : REGULAR_BUCKET)
  if (sensitive && bucket !== SENSITIVE_BUCKET) {
    return { error: 'misconfigured', detail: 'passport is not in the sensitive bucket', status: 500 }
  }

  if (sensitive) {
    if (!originIsAllowed(ctx.origin, ctx.allowedOrigin)) {
      return { error: 'unauthorized', detail: 'origin not allowed', status: 401 }
    }
    const unlockValid = await hasUnlock(env, caller.userId)
    let assertionVerified = false
    if (!unlockValid && body.assertion) {
      const asserted = await assertWebAuthn(env, caller.userId, ctx.origin, body.assertion)
      if ('error' in asserted) return asserted
      assertionVerified = true
    }
    const gate = requirePassportWebAuthn({
      kind: row.kind,
      unlockValid,
      assertionVerified,
    })
    if (!('ok' in gate)) return gate
  }

  const ttl = sensitive ? SENSITIVE_TTL_SEC : REGULAR_TTL_SEC

  const signed = await mintSignedUrl(env, bucket, row.path, ttl)
  if ('error' in signed) return signed
  return {
    signed_url: signed.url,
    expires_in: ttl,
    expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    filename: row.filename,
    mime_type: row.mime_type,
  }
}

async function locateDocument(
  env: SupabaseEnv,
  documentId: string,
  userId: string,
): Promise<LocatorRow | null> {
  const url = `${env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/rpc/sensitive_document_locator`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _document_id: documentId, _user_id: userId }),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as LocatorRow[]
  return rows[0] ?? null
}

async function mintSignedUrl(
  env: SupabaseEnv,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<{ url: string } | { error: string; detail?: string; status: number }> {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(
    `${env.SUPABASE_URL!.replace(/\/$/, '')}/storage/v1/object/sign/${bucket}/${encoded}`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { error: 'sign_failed', detail: txt.slice(0, 300), status: 502 }
  }
  const body = (await res.json()) as { signedURL?: string; signedUrl?: string }
  const rel = body.signedURL ?? body.signedUrl
  if (!rel) return { error: 'sign_failed', detail: 'no signed url', status: 502 }
  if (/^https?:\/\//i.test(rel)) return { url: rel }
  const base = env.SUPABASE_URL!.replace(/\/$/, '')
  const pathPart = rel.startsWith('/') ? rel : `/${rel}`
  const withV1 = pathPart.startsWith('/storage/v1/') ? pathPart : `/storage/v1${pathPart}`
  return { url: `${base}${withV1}` }
}
