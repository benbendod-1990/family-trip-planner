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
})
