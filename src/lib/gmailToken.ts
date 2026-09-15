// Gmail access-token broker — talks to the Worker.
//
// Why: Supabase only exposes provider_token for ~1h after sign-in and then
// drops it on JWT refresh. So we stash Google's refresh_token in
// gmail_credentials (via the Worker, after Gmail connect) and ask the Worker
// for a fresh access_token on demand.

import { supabase } from './supabase'
import { workerAuthHeaders } from './workerAuth'
import {
  GMAIL_RECONNECT_MESSAGE,
  GmailAuthError,
  throwForGmailBrokerStatus,
} from './gmailAuthError'
import { GMAIL_READONLY_SCOPE } from './googleOAuth'

export { GMAIL_RECONNECT_MESSAGE, GmailAuthError, throwForGmailBrokerStatus }

const AI_BASE = import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8787'

// Called after auth wire-up. Identity login no longer requests
// access_type=offline, so this no-ops unless the user just completed
// Gmail connect (gmail: true → offline + consent → refresh_token).
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
        scope: GMAIL_READONLY_SCOPE,
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
