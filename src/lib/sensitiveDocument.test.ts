import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripDocument } from '../types/trip-plan.ts'
import {
  capSignedUrlTtl,
  documentsVisibleToViewer,
  hasPassportFile,
  isPendingPassport,
  isSensitiveKind,
  PENDING_PASSPORT_PREFIX,
  redactSensitiveDocument,
  REGULAR_URL_TTL_SEC,
  SENSITIVE_DOC_BUCKET,
  SENSITIVE_URL_TTL_SEC,
  storageBucketFor,
} from './sensitiveDocument.ts'
import { classifyDocument } from './documentKind.ts'

const usa = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as { family: Array<{ id: string; name: string }>; documents: TripDocument[] }

describe('document kinds', () => {
  it('classifies passports before tickets and photos by filename', () => {
    assert.equal(classifyDocument('', '', 'דרכון-בן.pdf'), 'passport')
    assert.equal(classifyDocument('passport scan', '', 'scan.jpg'), 'passport')
    assert.equal(classifyDocument('', '', 'eticket.pdf'), 'flight')
    assert.equal(classifyDocument('', '', 'pool.jpg'), 'photo')
    assert.equal(classifyDocument('', '', 'voucher.pdf'), 'other')
  })
})

describe('sensitive document redaction', () => {
  it('keeps pending passport paths and strips uploaded keys', () => {
    const pending: TripDocument = {
      id: 'p1',
      path: PENDING_PASSPORT_PREFIX,
      filename: 'דרכון — בן',
      mimeType: 'application/octet-stream',
      size: 0,
      kind: 'passport',
      addedAt: '2026-09-07T00:00:00.000Z',
    }
    assert.equal(isPendingPassport(pending), true)
    assert.equal(hasPassportFile(pending), false)
    assert.equal(redactSensitiveDocument(pending).path, PENDING_PASSPORT_PREFIX)

    const uploaded = { ...pending, path: 'trip-id/doc-id-scan.jpg', size: 1200 }
    assert.equal(isSensitiveKind(uploaded.kind), true)
    assert.equal(hasPassportFile(uploaded), true)
    assert.equal(redactSensitiveDocument(uploaded).path, '')
    assert.equal(storageBucketFor(uploaded), SENSITIVE_DOC_BUCKET)
    assert.equal(documentsVisibleToViewer([pending, uploaded], true).length, 2)
    assert.equal(documentsVisibleToViewer([pending, uploaded], false).length, 0)
  })

  it('does not redact boarding-pass paths', () => {
    const flight: TripDocument = {
      id: 'f1',
      path: 'trip/f1-eticket.pdf',
      filename: 'eticket.pdf',
      mimeType: 'application/pdf',
      size: 10,
      kind: 'flight',
      addedAt: '2026-09-07T00:00:00.000Z',
    }
    assert.equal(redactSensitiveDocument(flight).path, flight.path)
    assert.equal(capSignedUrlTtl('flight', 3600), REGULAR_URL_TTL_SEC)
    assert.equal(capSignedUrlTtl('passport', 3600), SENSITIVE_URL_TTL_SEC)
    assert.equal(capSignedUrlTtl('passport', 10), 30)
  })
})

describe('USA Utopia passport slots', () => {
  it('seeds 12 metadata-only passports covering the party, with no invented images', () => {
    const slots = (usa.documents ?? []).filter(d => d.kind === 'passport')
    assert.equal(slots.length, 12)
    assert.equal(usa.family.length, 12)
    const names = slots.map(d => d.filename).join(' ')
    for (const n of ['בן', 'גל', 'עומר', 'ארי', 'עדן', 'ליבי', 'לביא', 'לירי', 'אבנר', 'רחל', 'אגם', 'שובל']) {
      assert.match(names, new RegExp(n))
    }
    const personIds = new Set(slots.map(d => d.personId))
    assert.equal(personIds.size, 12)
    for (const member of usa.family) {
      assert.equal(personIds.has(member.id), true)
    }
    for (const slot of slots) {
      assert.equal(slot.path, PENDING_PASSPORT_PREFIX)
      assert.equal(slot.size, 0)
      assert.equal(slot.mimeType.startsWith('image/'), false)
      assert.equal(slot.mimeType.includes('pdf'), false)
      assert.equal(slot.storageBucket, SENSITIVE_DOC_BUCKET)
    }
  })
})
