/**
 * Family catalog / product admins: Ben and Gal. These Google accounts see
 * every cloud trip (co-owner on all rows) and the admin-only surfaces
 * (registered users, document sync check). Everyone else sees only trips
 * they were invited to (RLS membership). Visibility is enforced in
 * Postgres, not by filtering here.
 */
export const FAMILY_CATALOG_EMAILS = [
  'benbendod@gmail.com',
  'shechter.gal@gmail.com',
] as const

export type FamilyCatalogEmail = (typeof FAMILY_CATALOG_EMAILS)[number]

export function isFamilyCatalogEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return (FAMILY_CATALOG_EMAILS as readonly string[]).includes(email.trim().toLowerCase())
}
