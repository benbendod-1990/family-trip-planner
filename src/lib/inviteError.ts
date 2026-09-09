/** Pull a useful message from Error, PostgREST `{message,details,hint,code}`, or string. */
export function rpcErrorText(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message
  if (e && typeof e === 'object') {
    const r = e as Record<string, unknown>
    const parts = [r.message, r.details, r.hint, r.code].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    )
    if (parts.length) return parts.join(' | ')
  }
  if (typeof e === 'string' && e.trim()) return e
  return ''
}

/** Hebrew status for a failed invite; never returns the tautology «שגיאה: שגיאה». */
export function inviteFailureStatus(e: unknown, email: string, origin: string): string {
  const msg = rpcErrorText(e)
  if (msg.includes('user_not_found')) {
    return `${email} עדיין לא נרשם. בקש שייכנס פעם אחת ל-${origin}/login ואז תזמין שוב.`
  }
  if (msg.includes('forbidden')) {
    return 'רק יוצר הטיול יכול להזמין'
  }
  if (!msg || msg === 'שגיאה') {
    return 'שגיאה לא ידועה'
  }
  return `שגיאה: ${msg}`
}
