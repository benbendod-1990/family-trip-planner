// Gmail OAuth token broker.
//
// Why this exists: Supabase's session.provider_token disappears on the first
// JWT refresh (~1h after sign-in). Without server-side refresh, Gmail sync
// breaks every hour and forces the user to re-login. So we store Google's
// refresh_token in `public.gmail_credentials` and mint a fresh access_token
// on demand here.
//
// Endpoints (both authenticated via Supabase JWT):
//   POST /api/gmail/store-refresh-token
//     body: { refresh_token: string, scope?: string }
//     called once right after sign-in (when Supabase still has the
//     provider_refresh_token in the session).
//
//   POST /api/gmail/access-token
//     returns: { access_token, expires_at }
//     reuses the cached token if still valid for >2min, otherwise refreshes.

interface CredRow {
  user_id: string
  refresh_token: string
  access_token: string | null
  expires_at: string | null
  scope: string | null
}

interface SupabaseEnv {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

export async function storeRefreshToken(
  env: SupabaseEnv,
  userId: string,
  body: { refresh_token?: unknown; scope?: unknown },
): Promise<{ ok: true } | { error: string; detail?: string; status: number }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'server_misconfigured', detail: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set', status: 500 }
  }
  const refresh = typeof body.refresh_token === 'string' ? body.refresh_token : ''
  if (!refresh) return { error: 'bad_request', detail: 'refresh_token required', status: 400 }
  const scope = typeof body.scope === 'string' ? body.scope : null

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/gmail_credentials`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      refresh_token: refresh,
      scope,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { error: 'db_error', detail: txt.slice(0, 300), status: 500 }
  }
  return { ok: true }
}

export async function getAccessToken(
  env: SupabaseEnv,
  userId: string,
): Promise<
  | { access_token: string; expires_at: string }
  | { error: string; detail?: string; status: number }
> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'server_misconfigured', detail: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set', status: 500 }
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return { error: 'server_misconfigured', detail: 'GOOGLE_CLIENT_ID/SECRET not set', status: 500 }
  }

  const row = await readCred(env, userId)
  if (!row) {
    return {
      error: 'no_refresh_token',
      detail: 'sign in with Google once to grant Gmail access',
      status: 412,
    }
  }

  // Reuse cached access_token if it has >2 min left.
  const skewMs = 2 * 60 * 1000
  if (row.access_token && row.expires_at) {
    const exp = Date.parse(row.expires_at)
    if (Number.isFinite(exp) && exp - Date.now() > skewMs) {
      return { access_token: row.access_token, expires_at: row.expires_at }
    }
  }

  // Refresh.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  })
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '')
    // 400 invalid_grant means the refresh token was revoked (user removed app
    // access, or password change). Force the user to re-grant.
    if (tokenRes.status === 400 && /invalid_grant/i.test(txt)) {
      await deleteCred(env, userId)
      return {
        error: 'refresh_token_revoked',
        detail: 'sign out and sign in with Google again',
        status: 412,
      }
    }
    return { error: 'google_token_error', detail: txt.slice(0, 300), status: 502 }
  }
  const tok = (await tokenRes.json()) as {
    access_token: string
    expires_in: number
    scope?: string
  }
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  await writeAccessToken(env, userId, tok.access_token, expiresAt, tok.scope)
  return { access_token: tok.access_token, expires_at: expiresAt }
}

async function readCred(env: SupabaseEnv, userId: string): Promise<CredRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/gmail_credentials?user_id=eq.${encodeURIComponent(userId)}&select=user_id,refresh_token,access_token,expires_at,scope`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as CredRow[]
  return rows[0] ?? null
}

async function writeAccessToken(
  env: SupabaseEnv,
  userId: string,
  accessToken: string,
  expiresAt: string,
  scope: string | undefined,
): Promise<void> {
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/gmail_credentials?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        access_token: accessToken,
        expires_at: expiresAt,
        ...(scope ? { scope } : {}),
        updated_at: new Date().toISOString(),
      }),
    },
  )
}

async function deleteCred(env: SupabaseEnv, userId: string): Promise<void> {
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/gmail_credentials?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    },
  )
}
