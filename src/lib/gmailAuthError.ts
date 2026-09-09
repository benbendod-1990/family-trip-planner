export const GMAIL_RECONNECT_MESSAGE =
  'החיבור ל-Gmail פג. התחבר מחדש עם Google כדי לחדש את גישת הקריאה למיילים.'

/**
 * Thrown when there's no usable Gmail refresh token on file — either the user
 * never granted Gmail access, or Google revoked the token (apps in "Testing"
 * OAuth status have their refresh tokens expire after 7 days) — or when the
 * Worker rejected the Supabase session (expired/missing JWT). Recoverable by
 * re-signing in with Google, so the UI surfaces a "reconnect" action instead
 * of a generic failure.
 */
export class GmailAuthError extends Error {
  constructor(message: string = GMAIL_RECONNECT_MESSAGE) {
    super(message)
    this.name = 'GmailAuthError'
  }
}

/** Maps Worker broker failures onto a reconnect error instead of raw JSON. */
export function throwForGmailBrokerStatus(status: number, body: string): never {
  if (status === 401 || status === 412) {
    throw new GmailAuthError(GMAIL_RECONNECT_MESSAGE)
  }
  throw new Error(`Gmail token broker ${status}: ${body.slice(0, 200)}`)
}
