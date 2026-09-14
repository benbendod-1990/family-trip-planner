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

export type InviteOutcome = 'added' | 'pending'

/** Map invite_user_to_trip RPC rows to a success outcome. Missing status → added. */
export function parseInviteOutcome(data: unknown): InviteOutcome {
  const row = Array.isArray(data) ? data[0] : data
  if (row && typeof row === 'object' && (row as { invite_status?: unknown }).invite_status === 'pending') {
    return 'pending'
  }
  return 'added'
}

/** Hebrew status for a failed invite; never «must register first», never «שגיאה: שגיאה». */
export function inviteFailureStatus(e: unknown, email: string): string {
  const msg = rpcErrorText(e)
  if (msg.includes('invalid_email')) {
    return 'אימייל לא תקין'
  }
  if (msg.includes('already_member')) {
    return `${email} כבר חבר בטיול`
  }
  if (msg.includes('forbidden')) {
    return 'רק יוצר הטיול יכול להזמין'
  }
  if (msg.includes('user_not_found')) {
    // Old 0002/0009 RPC still live — never tell Ben the invitee must register first.
    return 'ההזמנה לאימייל חדש ממתינה לעדכון בשרת (מיגרציה 0011 ב-Supabase)'
  }
  if (!msg || msg === 'שגיאה') {
    return 'שגיאה לא ידועה'
  }
  return `שגיאה: ${msg}`
}
