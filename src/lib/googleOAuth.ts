/**
 * Google OAuth options for Supabase signInWithOAuth.
 *
 * Identity login (join / login / session reconnect) must stay on non-sensitive
 * scopes. `gmail.readonly` is restricted — Google returns 403 access_denied for
 * anyone who isn't a test user until the app is verified, even when the
 * consent screen is in Production. Invitees only need identity to claim a
 * share link.
 *
 * Gmail is incremental: request the restricted scope only when the user
 * explicitly starts Gmail sync / reconnect.
 */

export const GOOGLE_IDENTITY_SCOPES = 'email profile'
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
export const GOOGLE_GMAIL_SCOPES = `${GOOGLE_IDENTITY_SCOPES} ${GMAIL_READONLY_SCOPE}`

export type GoogleSignInOpts = {
  /** Same-origin /join/<token> after OAuth; ignored unless it is a safe join path. */
  redirectPath?: string
  /** Incremental Gmail connect — restricted scope + offline refresh token. */
  gmail?: boolean
}

export type GoogleOAuthOptions = {
  scopes: string
  queryParams?: {
    access_type: 'offline'
    prompt: 'consent'
    include_granted_scopes: 'true'
  }
}

export function googleOAuthOptions(opts?: Pick<GoogleSignInOpts, 'gmail'>): GoogleOAuthOptions {
  if (opts?.gmail) {
    return {
      scopes: GOOGLE_GMAIL_SCOPES,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      },
    }
  }
  return { scopes: GOOGLE_IDENTITY_SCOPES }
}

export function scopesIncludeGmailReadonly(scopes: string): boolean {
  return scopes.split(/\s+/).includes(GMAIL_READONLY_SCOPE)
}
