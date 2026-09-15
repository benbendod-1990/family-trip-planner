// Must stay in lockstep with src/lib/familyCatalog.ts — Gmail pull is
// family-catalog admins only (Worker enforces; the UI only hides the button).

export const FAMILY_CATALOG_EMAILS = [
  'benbendod@gmail.com',
  'shechter.gal@gmail.com',
] as const

export function isFamilyCatalogEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return (FAMILY_CATALOG_EMAILS as readonly string[]).includes(email.trim().toLowerCase())
}

export function emailFromJwtPayload(payload: Record<string, unknown>): string | undefined {
  // Use the Auth email claim, never user_metadata (user-editable).
  if (typeof payload.email === 'string' && payload.email.includes('@')) {
    return payload.email.trim().toLowerCase()
  }
  return undefined
}
