import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isFamilyCatalogEmail } from './familyCatalog.ts'
import { throwForGmailBrokerStatus, GmailForbiddenError, GMAIL_ADMIN_ONLY_MESSAGE } from './gmailAuthError.ts'

const srcRoot = new URL('../', import.meta.url)

function read(rel: string): string {
  return readFileSync(new URL(rel, srcRoot), 'utf8')
}

describe('no service_role in the browser bundle', () => {
  it('client source never embeds a service role key or env name', () => {
    const files = [
      'lib/supabase.ts',
      'lib/tripDocuments.ts',
      'lib/tripRepo.ts',
      'pages/TripDoc.tsx',
      'lib/gmailToken.ts',
    ]
    for (const f of files) {
      const text = read(f)
      assert.equal(/service_role|SERVICE_ROLE|sb_secret_/i.test(text), false, f)
    }
    const envProd = readFileSync(new URL('../../.env.production', import.meta.url), 'utf8')
    assert.match(envProd, /VITE_SUPABASE_ANON_KEY/)
    assert.equal(/SERVICE_ROLE|service_role/.test(envProd), false)
  })
})

describe('guest trips do not ship documents', () => {
  it('GUEST_TRIPS is empty so demo visitors see no passports', () => {
    const demo = read('data/demoData.ts')
    assert.match(demo, /export const GUEST_TRIPS: TripPlan\[\] = \[\]/)
    const store = read('stores/tripStore.ts')
    assert.match(store, /isGuestTripStore/)
    assert.match(store, /GUEST_TRIPS/)
  })
})

describe('Gmail pull is family-catalog admin only', () => {
  it('maps Worker 403 to a non-reconnect Hebrew error', () => {
    assert.equal(isFamilyCatalogEmail('benbendod@gmail.com'), true)
    assert.throws(
      () => throwForGmailBrokerStatus(403, '{"error":"forbidden"}'),
      (err: unknown) => {
        assert.equal(err instanceof GmailForbiddenError, true)
        assert.equal((err as Error).message, GMAIL_ADMIN_ONLY_MESSAGE)
        assert.equal((err as Error).message.includes('Gmail token broker'), false)
        return true
      },
    )
  })

  it('hides Gmail CTAs behind isFamilyCatalogEmail and Worker-gates the broker', () => {
    const cloud = read('components/cloud/CloudSyncButton.tsx')
    const inline = read('components/gmail/GmailSyncInlineButton.tsx')
    const docs = read('pages/TripDoc.tsx')
    const sync = read('lib/gmailSync.ts')
    const worker = readFileSync(new URL('../../worker/src/index.ts', import.meta.url), 'utf8')
    assert.match(cloud, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(inline, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(docs, /isFamilyCatalogEmail\(user\?\.email\)/)
    assert.match(sync, /isFamilyCatalogEmail/)
    assert.match(worker, /assertFamilyCatalogGmail/)
    assert.match(worker, /\/api\/documents\/sign/)
  })
})

describe('migration 0015 passport storage', () => {
  it('creates a private sensitive bucket with no SELECT and a path-redacting list RPC', () => {
    const sql = readFileSync(
      new URL('../../supabase/migrations/0015_sensitive_documents.sql', import.meta.url),
      'utf8',
    )
    assert.match(sql, /trip-sensitive-documents/)
    assert.match(sql, /public = false/)
    assert.match(sql, /passport/)
    assert.match(sql, /photo/)
    assert.match(sql, /list_trip_documents/)
    assert.match(sql, /sensitive_document_locator/)
    assert.match(sql, /Deliberately no SELECT policy/)
    assert.match(sql, /revoke all on function public.sensitive_document_locator/)
    assert.match(sql, /grant execute on function public.sensitive_document_locator\(uuid, uuid\) to service_role/)
    assert.equal(/create policy "trip members read sensitive documents"/i.test(sql), false)
    assert.match(sql, /kind <> 'passport' or storage_bucket = 'trip-sensitive-documents'/)
  })

  it('client documentUrl never uses a 1-hour TTL and passports go through the Worker', () => {
    const docs = read('lib/tripDocuments.ts')
    assert.equal(docs.includes('60 * 60'), false)
    assert.match(docs, /signViaWorker/)
    assert.match(docs, /\/api\/documents\/sign/)
    assert.match(docs, /list_trip_documents/)
    assert.match(docs, /redactSensitiveDocument/)
  })
})
