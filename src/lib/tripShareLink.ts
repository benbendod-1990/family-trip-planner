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

export function quotedTripName(name: string): string {
  return `«${name}»`
}

export function shareInviteText(tripName: string): string {
  return `הוזמנת לטיול ${quotedTripName(tripName)}`
}

export function whatsappShareHref(opts: { url: string; tripName: string }): string {
  const text = `${shareInviteText(opts.tripName)}\n${opts.url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Bind share to the tapped card — never a sibling's id. */
export function shareTargetForCard(trip: { id: string; name: string }): { tripId: string; tripName: string } {
  if (!trip.id) throw new Error('share requires trip.id from this card')
  return { tripId: trip.id, tripName: trip.name }
}

export function shareTargetsForCards(
  trips: readonly { id: string; name: string }[],
): { tripId: string; tripName: string }[] {
  return trips.map(shareTargetForCard)
}

export function shareTargetFromButton(
  el: { getAttribute(name: string): string | null } | null,
  fallback: { tripId: string; tripName: string },
): { tripId: string; tripName: string } {
  return shareTargetForCard({
    id: el?.getAttribute('data-trip-id') || fallback.tripId,
    name: el?.getAttribute('data-trip-name') || fallback.tripName,
  })
}

/** Drop a cached token unless it was stored for this exact tripId. */
export function cachedShareLinkForTrip<T>(
  cached: { tripId: string; link: T } | null | undefined,
  tripId: string,
): T | null {
  if (!cached || cached.tripId !== tripId) return null
  return cached.link
}

/**
 * After create_or_get, peek must name the trip we asked for.
 * Stops a Holland token from being copied off the USA card.
 */
export function assertSharePeekMatchesTrip(
  requestedTripId: string,
  peek: { trip_id: string; trip_name: string } | null | undefined,
): { trip_id: string; trip_name: string } {
  if (!peek || peek.trip_id !== requestedTripId) {
    throw new Error('share_trip_mismatch')
  }
  return peek
}

export function sharePreparingToast(tripName: string): string {
  return `מכין לינק שיתוף ל${quotedTripName(tripName)}…`
}

export function shareOutcomeToast(tripName: string, result: ShareLinkResult): string {
  const q = quotedTripName(tripName)
  if (result === 'shared') return `✓ נפתח שיתוף ל${q} — הלינק מוכן`
  if (result === 'copied') return `✓ הלינק ל${q} הועתק — אפשר לשלוח בוואטסאפ`
  return `לא הצלחנו להעתיק אוטומטית את הלינק ל${q}. העתיקו או שלחו בוואטסאפ.`
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
        text: shareInviteText(opts.tripName),
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
  if (msg.includes('share_trip_mismatch')) {
    return 'הלינק שחזר מהשרת שייך לטיול אחר. לא שותף כלום — נסו שוב מהכרטיס הנכון.'
  }
  if (msg.includes('forbidden') || msg.includes('only the trip owner')) {
    return 'רק יוצר הטיול יכול לשתף לינק.'
  }
  if (
    /column reference "trip_id" is ambiguous/i.test(msg) ||
    (msg.includes('claim_trip_share_link') &&
      (msg.includes('42702') || /column reference ".+" is ambiguous/i.test(msg)))
  ) {
    return 'שגיאת הצטרפות לטיול בשרת (מיגרציה 0014). רעננו את האפליקציה ונסו שוב.'
  }
  if (
    /column reference "expires_at" is ambiguous/i.test(msg) ||
    (msg.includes('expires_at') && msg.includes('42702'))
  ) {
    return 'שגיאת שיתוף בשרת (מיגרציה 0013). רעננו את האפליקציה ונסו שוב.'
  }
  if (
    msg.includes('42702') ||
    /column reference ".+" is ambiguous/i.test(msg)
  ) {
    return 'שגיאת שיתוף בשרת. רעננו את האפליקציה ונסו שוב.'
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
