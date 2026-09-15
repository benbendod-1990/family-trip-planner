import { isFamilyCatalogEmail } from './familyCatalog.ts'
import type { AuthedCaller } from './auth.ts'

export const FAMILY_CATALOG_GMAIL_DETAIL = 'family_catalog_admin_required'

interface SupabaseEnv {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export async function assertFamilyCatalogGmail(
  env: SupabaseEnv,
  caller: AuthedCaller,
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string; detail: string }> {
  if (caller.kind !== 'supabase-user' || !caller.userId) {
    return { ok: false, status: 401, error: 'unauthorized', detail: 'user session required' }
  }
  const email = caller.email ?? await lookupAuthEmail(env, caller.userId)
  if (!email || !isFamilyCatalogEmail(email)) {
    return {
      ok: false,
      status: 403,
      error: 'forbidden',
      detail: FAMILY_CATALOG_GMAIL_DETAIL,
    }
  }
  return { ok: true, email }
}

async function lookupAuthEmail(env: SupabaseEnv, userId: string): Promise<string | undefined> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return undefined
  try {
    const res = await fetch(
      `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    )
    if (!res.ok) return undefined
    const user = (await res.json()) as { email?: unknown }
    return typeof user.email === 'string' ? user.email.trim().toLowerCase() : undefined
  } catch {
    return undefined
  }
}
