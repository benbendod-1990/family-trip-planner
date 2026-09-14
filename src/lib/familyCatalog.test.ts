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
})
