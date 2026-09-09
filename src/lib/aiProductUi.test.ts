import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AI_PRODUCT_UI_ENABLED } from './aiFeatures.ts'

function src(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

describe('in-app AI product UI is unmounted', () => {
  it('keeps the product-AI flag off', () => {
    assert.equal(AI_PRODUCT_UI_ENABLED, false)
  })

  it('Itinerary no longer mounts AiItineraryModal or SmartAddBar', () => {
    const text = src('../pages/Itinerary.tsx')
    assert.equal(text.includes('AiItineraryModal'), false)
    assert.equal(text.includes('SmartAddBar'), false)
    assert.equal(text.includes('בנה לי מסלול עם AI'), false)
  })

  it('AppLayout no longer mounts AiChatDrawer', () => {
    const text = src('../components/layout/AppLayout.tsx')
    assert.equal(text.includes('AiChatDrawer'), false)
    assert.equal(text.includes('@/components/ai/'), false)
  })

  it('FamilyProfile no longer mounts AiSettings', () => {
    const text = src('../pages/FamilyProfile.tsx')
    assert.equal(text.includes('AiSettings'), false)
  })

  it('Travel no longer mounts SmartImportModal', () => {
    const text = src('../pages/Travel.tsx')
    assert.equal(text.includes('SmartImportModal'), false)
    assert.equal(text.includes('ייבוא חכם (AI)'), false)
  })

  it('Gmail sync still wires CloudSync and the Gmail token client', () => {
    const cloud = src('../components/cloud/CloudSyncButton.tsx')
    const gmail = src('../lib/gmailSync.ts')
    assert.equal(cloud.includes('syncFromGmail'), true)
    assert.equal(gmail.includes('parseEmails'), true)
    assert.equal(gmail.includes('fetchTravelEmails'), true)
  })

  it('never auto-runs Gmail on mount or login — only the explicit Gmail button', () => {
    const cloud = src('../components/cloud/CloudSyncButton.tsx')
    assert.equal(cloud.includes('auto-placeholder-rescan-done'), false)
    assert.equal(cloud.includes('מזהה הזמנות חסרות'), false)
    assert.equal(cloud.includes('forceFull'), false)
    assert.equal(cloud.includes('onClick={syncGmail}'), true)
    assert.equal(cloud.includes('const syncGmail = async'), true)
  })

  it('TripDoc link-only cards are not badged as waiting for Gmail', () => {
    const page = src('../pages/TripDoc.tsx')
    assert.equal(page.includes('ממתין ל-Gmail'), false)
    assert.equal(page.includes('ממתין לקובץ מהמייל'), false)
    assert.ok(page.includes('אין PDF עדיין'))
    assert.ok(page.includes('קישור להזמנה'))
    assert.ok(page.includes('אין סריקה אוטומטית'))
    assert.ok(page.includes('onClick={() => void onPull()}'))
    assert.ok(page.includes('הצג'))
  })

  it('TripDoc maps Gmail 401 to a Hebrew reconnect CTA, not raw broker JSON', () => {
    const page = src('../pages/TripDoc.tsx')
    assert.equal(page.includes('AuthReconnectBanner'), true)
    assert.equal(page.includes('GmailAuthError'), true)
    const token = src('../lib/gmailToken.ts')
    const authErr = src('../lib/gmailAuthError.ts')
    assert.equal(token.includes('throwForGmailBrokerStatus'), true)
    assert.match(authErr, /status === 401/)
  })

  it('Gmail pull functions are only imported by explicit click surfaces', () => {
    const allowedSync = new Set([
      'CloudSyncButton.tsx',
      'GmailSyncInlineButton.tsx',
      'gmailSync.ts',
      'aiProductUi.test.ts',
    ])
    const allowedPull = new Set(['TripDoc.tsx', 'gmailSync.ts', 'aiProductUi.test.ts'])
    const files = [
      ['../components/cloud/CloudSyncButton.tsx', 'CloudSyncButton.tsx'],
      ['../components/gmail/GmailSyncInlineButton.tsx', 'GmailSyncInlineButton.tsx'],
      ['../pages/TripDoc.tsx', 'TripDoc.tsx'],
      ['../lib/gmailSync.ts', 'gmailSync.ts'],
      ['../lib/AuthContext.tsx', 'AuthContext.tsx'],
      ['../stores/tripStore.ts', 'tripStore.ts'],
      ['../lib/tripLifecycleSync.ts', 'tripLifecycleSync.ts'],
      ['../lib/tripAutoSync.ts', 'tripAutoSync.ts'],
      ['../App.tsx', 'App.tsx'],
    ] as const
    for (const [rel, name] of files) {
      let text: string
      try { text = src(rel) } catch { continue }
      if (text.includes('syncFromGmail(') && !allowedSync.has(name)) {
        assert.fail(`${name} must not call syncFromGmail`)
      }
      if (text.includes('pullAllDocuments(') && !allowedPull.has(name)) {
        assert.fail(`${name} must not call pullAllDocuments`)
      }
    }
    const inline = src('../components/gmail/GmailSyncInlineButton.tsx')
    assert.ok(inline.includes('onClick={run}'))
    assert.equal(inline.includes('useEffect'), false)
  })
})
