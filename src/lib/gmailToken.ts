// Gmail access-token broker — talks to the Worker.
//
// Why: Supabase only exposes provider_token for ~1h after sign-in and then
// drops it on JWT refresh. So we stash Google's refresh_token in
// gmail_credentials (via the Worker, once at sign-in) and ask the Worker
// for a fresh access_token on demand.

import { supabase } from './supabase'

const AI_BASE = import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8787'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  else if (import.meta.env.VITE_AI_SHARED_SECRET) {
    headers['x-api-secret'] = import.meta.env.VITE_AI_SHARED_SECRET
  }
  return headers
}

// Called once right after sign-in, when Supabase still has the
// provider_refresh_token in the session. Silently no-ops if there's
// nothing to store (e.g. user signed in via a flow that didn't return
// a refresh token — happens when access_type=offline + prompt=consent
// were not requested).
export async function persistGmailRefreshToken(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const refresh = data.session?.provider_refresh_token
  if (!refresh) return
  try {
    const res = await fetch(`${AI_BASE}/api/gmail/store-refresh-token`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        refresh_token: refresh,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      }),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.warn('[gmailToken] persist failed:', res.status, t.slice(0, 200))
    }
  } catch (e) {
    console.warn('[gmailToken] persist threw:', e)
  }
}

// Returns a fresh Gmail access token (Worker handles refresh).
// Throws with a user-actionable message if no refresh token is on file.
export async function fetchGmailAccessToken(): Promise<string> {
  const res = await fetch(`${AI_BASE}/api/gmail/access-token`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (res.status === 412) {
    throw new Error(
      'אין הרשאת Gmail. צא והיכנס שוב עם Google כדי לתת גישה ל-Gmail (read-only).'
    )
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Gmail token broker ${res.status}: ${t.slice(0, 200)}`)
  }
  const body = (await res.json()) as { access_token: string; expires_at: string }
  return body.access_token
}
