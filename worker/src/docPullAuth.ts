import { isFamilyCatalogEmail } from '../../src/lib/familyCatalog.ts'
import type { AuthedCaller } from './auth'

/**
 * `/api/docs/pull` is an admin action (document sync check), not a trip-owner
 * action. Shared-secret stays for local wrangler tests.
 */
export function callerMayPullTripDoc(caller: AuthedCaller): boolean {
  if (caller.kind === 'shared-secret') return true
  return isFamilyCatalogEmail(caller.email)
}
