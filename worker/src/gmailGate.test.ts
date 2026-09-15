import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailFromJwtPayload, FAMILY_CATALOG_EMAILS, isFamilyCatalogEmail } from './familyCatalog.ts'
import { assertFamilyCatalogGmail, FAMILY_CATALOG_GMAIL_DETAIL } from './gmailGate.ts'

describe('worker family catalog', () => {
  it('matches the app catalog emails and ignores user_metadata', () => {
    assert.deepEqual([...FAMILY_CATALOG_EMAILS], ['benbendod@gmail.com', 'shechter.gal@gmail.com'])
    assert.equal(isFamilyCatalogEmail('BenBendod@gmail.com'), true)
    assert.equal(isFamilyCatalogEmail('Edenbendavid1992@gmail.com'), false)
    assert.equal(
      emailFromJwtPayload({ email: 'benbendod@gmail.com', user_metadata: { email: 'attacker@evil' } }),
      'benbendod@gmail.com',
    )
    assert.equal(emailFromJwtPayload({ user_metadata: { email: 'benbendod@gmail.com' } }), undefined)
  })

  it('stays in lockstep with src/lib/familyCatalog.ts', () => {
    const app = readFileSync(new URL('../../src/lib/familyCatalog.ts', import.meta.url), 'utf8')
    assert.match(app, /benbendod@gmail.com/)
    assert.match(app, /shechter.gal@gmail.com/)
  })
})

describe('Gmail admin gate', () => {
  it('403s a signed-in non-admin without looking up Gmail tokens', async () => {
    const result = await assertFamilyCatalogGmail({}, {
      kind: 'supabase-user',
      userId: 'user-1',
      email: 'eden@example.com',
    })
    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: 'forbidden',
      detail: FAMILY_CATALOG_GMAIL_DETAIL,
    })
  })

  it('allows Ben and Gal', async () => {
    const ben = await assertFamilyCatalogGmail({}, {
      kind: 'supabase-user',
      userId: 'ben',
      email: 'benbendod@gmail.com',
    })
    assert.equal(ben.ok, true)
    const gal = await assertFamilyCatalogGmail({}, {
      kind: 'supabase-user',
      userId: 'gal',
      email: 'shechter.gal@gmail.com',
    })
    assert.equal(gal.ok, true)
  })

  it('rejects the shared-secret path', async () => {
    const result = await assertFamilyCatalogGmail({}, { kind: 'shared-secret' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.status, 401)
  })
})
