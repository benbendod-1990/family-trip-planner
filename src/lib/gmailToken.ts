// Gmail access-token broker — talks to the Worker.
//
// Why: Supabase only exposes provider_token for ~1h after sign-in and then
// drops it on JWT refresh. So we stash Google's refresh_token in
// gmail_credentials (via the Worker, once at sign-in) and ask the Worker
// for a fresh access_token on demand.

import { supabase } from './supabase'
import { workerAuthHeaders } from './workerAuth'
import {
  GMAIL_RECONNECT_MESSAGE,
  GmailAuthError,
  throwForGmailBrokerStatus,
} from './gmailAuthError'

export { GMAIL_RECONNECT_MESSAGE, GmailAuthError, throwForGmailBrokerStatus }

const AI_BASE = import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8787'

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
      headers: await workerAuthHeaders(),
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
// Throws GmailAuthError when the session is missing/expired or no refresh
// token is on file — the UI shows a reconnect CTA, never the raw broker body.
export async function fetchGmailAccessToken(): Promise<string> {
  const headers = await workerAuthHeaders()
  if (!headers.Authorization && !headers['x-api-secret']) {
    throw new GmailAuthError(GMAIL_RECONNECT_MESSAGE)
  }
  const res = await fetch(`${AI_BASE}/api/gmail/access-token`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throwForGmailBrokerStatus(res.status, t)
  }
  const body = (await res.json()) as { access_token: string; expires_at: string }
  return body.access_token
}
