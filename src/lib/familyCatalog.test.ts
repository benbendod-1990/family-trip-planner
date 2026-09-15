import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FAMILY_CATALOG_EMAILS, isFamilyCatalogEmail } from './familyCatalog.ts'

describe('family catalog emails', () => {
  it('is only Ben and Gal, case-insensitive', () => {
    assert.deepEqual([...FAMILY_CATALOG_EMAILS], ['benbendod@gmail.com', 'shechter.gal@gmail.com'])
    assert.equal(isFamilyCatalogEmail('benbendod@gmail.com'), true)
    assert.equal(isFamilyCatalogEmail('Shechter.gal@gmail.com'), true)
    assert.equal(isFamilyCatalogEmail('Edenbendavid1992@gmail.com'), false)
    assert.equal(isFamilyCatalogEmail(null), false)
  })

  it('listTrips does not client-filter by email — RLS membership is the catalog', () => {
    const repo = readFileSync(new URL('./tripRepo.ts', import.meta.url), 'utf8')
    const listBlock = repo.slice(
      repo.indexOf('export async function listTrips'),
      repo.indexOf('async function hydrateTrip'),
    )
    assert.match(listBlock, /from\('trips'\)/)
    assert.equal(listBlock.includes('FAMILY_CATALOG_EMAILS'), false)
    assert.equal(listBlock.includes('isFamilyCatalogEmail'), false)
  })

  it('TripDocCard gates the sync check on isFamilyCatalogEmail, not trip owner', () => {
    const card = readFileSync(new URL('../components/dashboard/TripDocCard.tsx', import.meta.url), 'utf8')
    assert.match(card, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(card, /if \(!isAdmin\) return/)
    assert.match(card, /בדוק סנכרון מול המסמך/)
    assert.match(card, /OpenDoc/)
    assert.equal(card.includes('useIsTripOwner'), false)
    assert.equal(card.includes('isOwner'), false)
    assert.equal(card.includes('רק יוצר הטיול יכול לבדוק סנכרון'), false)
    assert.equal(card.includes('familySeeds'), false)
  })

  it('TripDoc in-app plan reader is the same admin gate; Home stays off the membership RPC', () => {
    const page = readFileSync(new URL('../pages/TripDoc.tsx', import.meta.url), 'utf8')
    assert.match(page, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(page, /isAdmin && trip\.docUrl && !planText/)
    // Passports stay trip-owner (share-link joiners must not see slots).
    assert.match(page, /useIsTripOwner/)
    const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8')
    assert.equal(home.includes('listTripMembers'), false)
    assert.equal(home.includes('useIsTripOwner'), false)
    assert.equal(home.includes('checkDocSync'), false)
  })

  it('the Worker pull rejects non-catalog callers; Gmail identity scopes stay email+profile', () => {
    const worker = readFileSync(new URL('../../worker/src/index.ts', import.meta.url), 'utf8')
    const gate = readFileSync(new URL('../../worker/src/docPullAuth.ts', import.meta.url), 'utf8')
    assert.match(worker, /callerMayPullTripDoc\(caller\)/)
    assert.match(gate, /isFamilyCatalogEmail/)
    assert.match(gate, /from '\.\.\/\.\.\/src\/lib\/familyCatalog\.ts'/)
    const oauth = readFileSync(new URL('./googleOAuth.ts', import.meta.url), 'utf8')
    assert.match(oauth, /GOOGLE_IDENTITY_SCOPES = 'email profile'/)
    assert.equal(/GOOGLE_IDENTITY_SCOPES = '.*gmail/i.test(oauth), false)
  })

  it('0011 seeds Gal as owner on every trip including Rome and claims family catalog as owner', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0011_pending_trip_invites.sql', import.meta.url), 'utf8')
    assert.match(sql, /shechter\.gal@gmail.com/)
    assert.match(sql, /30a5d517-0db3-427f-adfa-92ef125e1f8f/)
    assert.match(sql, /is_family_catalog_email/)
    assert.match(sql, /select t\.id, _user_id, 'owner'::trip_role/)
    assert.match(sql, /ensure_family_catalog_memberships/)
    assert.match(sql, /not the trip owner/)
    assert.equal(sql.includes('hourly'), true)
  })

  it('0015 admin roster reuses is_family_catalog_email — no third allowlist', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0015_admin_list_registered_users.sql', import.meta.url), 'utf8')
    assert.match(sql, /is_family_catalog_email/)
    assert.match(sql, /benbendod@gmail.com/)
    assert.match(sql, /shechter\.gal@gmail.com/)
    assert.equal(sql.includes('Edenbendavid'), false)
    assert.match(sql, /forbidden: family catalog only/)
  })
})
