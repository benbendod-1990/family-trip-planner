// Shared Worker auth headers for Gmail broker + Doc pull + Gemini routes.
//
// getSession() returns the localStorage copy without waiting for a refresh, so
// a tab that sat in the background on iPhone Safari will send an expired JWT
// and the Worker 401s. Refresh first when the token is gone or about to expire.

import { supabase } from './supabase'

const REFRESH_SKEW_SEC = 60

export async function getWorkerAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  let session = data.session
  if (!session?.access_token) return null

  const expiresAt = session.expires_at ?? 0
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt <= now + REFRESH_SKEW_SEC) {
    const { data: refreshed, error } = await supabase.auth.refreshSession()
    if (error || !refreshed.session?.access_token) return null
    session = refreshed.session
  }
  return session.access_token
}

export async function workerAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = await getWorkerAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else if (import.meta.env.VITE_AI_SHARED_SECRET) {
    headers['x-api-secret'] = import.meta.env.VITE_AI_SHARED_SECRET
  }
  return headers
}
