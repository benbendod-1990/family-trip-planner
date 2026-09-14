/** WhatsApp-friendly /join/<token> helpers. No Supabase imports — Home-safe. */

export const SHARE_TOKEN_RE = /^[0-9a-f]{64}$/
export const PENDING_SHARE_TOKEN_KEY = 'ftp.pendingShareToken'
export const PROD_ORIGIN = 'https://family-trip-planner-end.pages.dev'

export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN_RE.test(value)
}

export function joinPathForToken(token: string): string {
  return `/join/${token}`
}

/** Relative /join/<64 hex> only — never an absolute or protocol-relative URL. */
export function isSafeJoinPath(path: string): boolean {
  return /^\/join\/[0-9a-f]{64}$/.test(path)
}

function appOrigin(origin?: string): string {
  if (origin) return origin.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return PROD_ORIGIN
}

function appBase(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env
  return String(env?.BASE_URL || '/').replace(/\/$/, '')
}

export function tripShareJoinUrl(token: string, origin?: string): string {
  return `${appOrigin(origin)}${appBase()}/join/${token}`
}

/** OAuth redirectTo: same-origin /join/<token>, otherwise the app root. */
export function oauthRedirectUrl(redirectPath?: string, origin?: string): string {
  const root = `${appOrigin(origin)}${appBase()}/`
  if (redirectPath && isSafeJoinPath(redirectPath)) {
    return `${appOrigin(origin)}${appBase()}${redirectPath}`
  }
  return root
}

export function stashPendingShareToken(token: string): void {
  if (!isShareToken(token)) return
  try {
    sessionStorage.setItem(PENDING_SHARE_TOKEN_KEY, token)
  } catch {
    /* private mode */
  }
}

export function peekPendingShareToken(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_SHARE_TOKEN_KEY)
    return isShareToken(value) ? value : null
  } catch {
    return null
  }
}

export function clearPendingShareToken(): void {
  try {
    sessionStorage.removeItem(PENDING_SHARE_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function formatShareExpiry(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function whatsappShareHref(opts: { url: string; tripName: string }): string {
  const text = `הוזמנת לטיול ${opts.tripName}\n${opts.url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

export type ShareLinkResult = 'shared' | 'copied' | 'failed'

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}

/**
 * Copy the join URL, then try the native share sheet.
 * navigator.share / clipboard both need a user gesture on iOS — callers that
 * await a network RPC first must show a visible toast and offer WhatsApp /
 * copy buttons for a fresh tap.
 */
export async function copyAndShareTripLink(opts: {
  url: string
  tripName: string
}): Promise<ShareLinkResult> {
  const copied = await copyText(opts.url)
  const share = typeof navigator !== 'undefined' ? navigator.share : undefined
  if (typeof share === 'function') {
    try {
      await share.call(navigator, {
        title: opts.tripName,
        text: `הוזמנת לטיול ${opts.tripName}`,
        url: opts.url,
      })
      return 'shared'
    } catch (err) {
      // User dismissed the sheet — still a successful share attempt.
      if (isAbortError(err)) return copied ? 'copied' : 'shared'
      return copied ? 'copied' : 'failed'
    }
  }
  return copied ? 'copied' : 'failed'
}

export function shareLinkFailureStatus(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (msg.includes('share_link_expired')) return 'הלינק פג תוקף. בקשו לינק חדש מבעל הטיול.'
  if (msg.includes('share_link_revoked')) return 'הלינק בוטל. בקשו לינק חדש מבעל הטיול.'
  if (msg.includes('share_link_invalid')) return 'הלינק לא תקין או שפג תוקפו.'
  if (msg.includes('unauthenticated')) return 'התחברו עם Google כדי להמשיך.'
  if (msg.includes('forbidden') || msg.includes('only the trip owner')) {
    return 'רק יוצר הטיול יכול לשתף לינק.'
  }
  if (
    msg.includes('0012') ||
    msg.includes('Could not find the function') ||
    msg.includes('PGRST202') ||
    msg.includes('schema cache')
  ) {
    return 'השיתוף ממתין לעדכון בשרת (מיגרציה 0012 ב-Supabase)'
  }
  if (/Failed to fetch|NetworkError|net::ERR|Load failed/i.test(msg)) {
    return 'אין חיבור לרשת. בדקו את החיבור ונסו שוב.'
  }
  if (!msg || msg === 'שגיאה') return 'שגיאה לא ידועה'
  return `שגיאה: ${msg}`
}
