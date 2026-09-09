import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripDocument, TripPlan } from '../types/trip-plan.ts'
import {
  documentHref,
  dropCoveredLinkDocuments,
  ensureSeedBookingDocuments,
  findGmailPlaceholder,
  isLinkOnlyDocument,
  mergeServerDocuments,
  STALE_USA_SEED_DOC_IDS,
} from './seedBookingDocuments.ts'

const usa = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as TripPlan

function linkDoc(partial: Partial<TripDocument> & Pick<TripDocument, 'id' | 'filename'>): TripDocument {
  const url = partial.url ?? 'https://example.com/booking'
  return {
    path: `external:${url}`,
    mimeType: 'text/uri-list',
    size: 0,
    kind: 'flight',
    addedAt: '2026-09-07T00:00:00.000Z',
    url,
    ...partial,
  }
}

function fileDoc(id: string, filename: string): TripDocument {
  return {
    id,
    path: `trip/${id}-${filename}`,
    filename,
    mimeType: 'application/pdf',
    size: 12000,
    kind: 'flight',
    addedAt: '2026-09-07T00:00:00.000Z',
    sha256: `hash-${id}`,
  }
}

describe('USA seed booking documents', () => {
  it('ships five Gmail placeholders for the known El Al PNRs and Utopia bookings', () => {
    const docs = usa.documents ?? []
    assert.equal(docs.length, 5)
    assert.ok(docs.every(isLinkOnlyDocument))
    assert.ok(docs.every(d => d.size === 0 && d.mimeType === 'text/uri-list'))
    const names = docs.map(d => d.filename).join(' ')
    assert.match(names, /X5OKQQ/)
    assert.match(names, /X5G7DK/)
    assert.match(names, /3753418/)
    assert.match(names, /3753537/)
    const ids = docs.map(d => d.sourceMessageId)
    assert.ok(ids.includes('1a068f623c9fe07b'))
    assert.ok(ids.includes('1a068f62222c52b9'))
    assert.ok(ids.includes('1a075a7c145b4ea4'))
    assert.ok(ids.includes('1a07f94b110c890e'))
    assert.ok(ids.includes('1a07f9480390adda'))
    assert.ok(docs.every(d => documentHref(d)?.startsWith('https://')))
    assert.equal(docs.some(d => (d.sourceSubject ?? '').includes('ממתין')), false)
  })

  it('wires the planning Google Doc id and title', () => {
    assert.equal(
      usa.docUrl,
      'https://docs.google.com/document/d/1gAabX9m9vWPLBjvQZszXpEh5_rCJWC6dArhMe8E8aGo/edit',
    )
    assert.match(usa.docTitle ?? '', /ארה״ב 2027/)
  })

  it('does not invent PDF bytes', () => {
    for (const d of usa.documents ?? []) {
      assert.equal(d.mimeType.startsWith('application/pdf'), false)
      assert.equal((d.path ?? '').startsWith('external:https://'), true)
    }
  })
})

describe('mergeServerDocuments', () => {
  it('keeps server file-documents and local link-only cards', () => {
    const local = [
      linkDoc({ id: 'seed-1', filename: 'PNR X5OKQQ' }),
      fileDoc('local-file', 'stale.pdf'),
    ]
    const remote = [fileDoc('server-file', 'eticket.pdf')]
    const merged = mergeServerDocuments(local, remote)
    assert.equal(merged.some(d => d.id === 'server-file'), true)
    assert.equal(merged.some(d => d.id === 'seed-1'), true)
    assert.equal(merged.some(d => d.id === 'local-file'), false)
  })

  it('does not duplicate a link card the server already has', () => {
    const card = linkDoc({ id: 'seed-1', filename: 'PNR X5OKQQ' })
    const merged = mergeServerDocuments([card], [card])
    assert.equal(merged.length, 1)
  })

  it('drops a seed link when the server already has the real PDF for that message', () => {
    const seed = linkDoc({
      id: 'seed-x5okqq',
      filename: 'X5OKQQ.pdf — אל על · בן',
      sourceMessageId: '1a068f623c9fe07b',
    })
    const pdf = fileDoc('real-x5okqq', 'X5OKQQ.pdf')
    pdf.sourceMessageId = '1a068f623c9fe07b'
    const merged = mergeServerDocuments([seed], [pdf])
    assert.equal(merged.some(d => d.id === 'real-x5okqq'), true)
    assert.equal(merged.some(d => d.id === 'seed-x5okqq'), false)
    assert.equal(merged.length, 1)
  })
})

describe('ensureSeedBookingDocuments', () => {
  it('injects missing USA booking cards onto a live trip that has none', () => {
    const live: TripPlan = { ...usa, documents: [] }
    const out = ensureSeedBookingDocuments([live], [usa])
    assert.equal((out[0]?.documents ?? []).length, 5)
    assert.ok((out[0]?.documents ?? []).some(d => d.filename.includes('X5OKQQ')))
  })

  it('replaces the stale 3-card USA set with Dorit\'s Gmail placeholders', () => {
    const stale = [...STALE_USA_SEED_DOC_IDS].map((id, i) =>
      linkDoc({ id, filename: `old-${i}` }),
    )
    const live: TripPlan = { ...usa, documents: stale }
    const out = ensureSeedBookingDocuments([live], [usa])
    const docs = out[0]?.documents ?? []
    assert.equal(docs.some(d => STALE_USA_SEED_DOC_IDS.has(d.id)), false)
    assert.equal(docs.length, 5)
    assert.ok(docs.some(d => d.sourceMessageId === '1a068f623c9fe07b'))
  })

  it('is self-limiting once the seed cards are present', () => {
    const once = ensureSeedBookingDocuments([{ ...usa, documents: [] }], [usa])
    const twice = ensureSeedBookingDocuments(once, [usa])
    assert.equal((twice[0]?.documents ?? []).length, (once[0]?.documents ?? []).length)
  })

  it('does not re-inject a seed link once a real file exists for that message id', () => {
    const pdf = fileDoc('real-x5okqq', 'X5OKQQ.pdf')
    pdf.sourceMessageId = '1a068f623c9fe07b'
    const live: TripPlan = { ...usa, documents: [pdf] }
    const out = ensureSeedBookingDocuments([live], [usa])
    const docs = out[0]?.documents ?? []
    assert.equal(docs.some(d => d.id === 'real-x5okqq' && !isLinkOnlyDocument(d)), true)
    assert.equal(docs.some(d => d.sourceMessageId === '1a068f623c9fe07b' && isLinkOnlyDocument(d)), false)
    assert.equal(docs.filter(isLinkOnlyDocument).length, 4)
  })

  it('drops a seed link that is sitting next to the real PDF for the same message', () => {
    const pdf = fileDoc('real-gal', 'X5OKQQ.pdf')
    pdf.sourceMessageId = '1a068f62222c52b9'
    const seedGal = (usa.documents ?? []).find(d => d.sourceMessageId === '1a068f62222c52b9')
    assert.ok(seedGal)
    const live: TripPlan = { ...usa, documents: [pdf, seedGal!] }
    const out = ensureSeedBookingDocuments([live], [usa])
    const docs = out[0]?.documents ?? []
    assert.equal(docs.some(d => d.id === seedGal!.id), false)
    assert.equal(docs.some(d => d.id === 'real-gal'), true)
  })
})

describe('dropCoveredLinkDocuments', () => {
  it('keeps uncovered cruise/kids links and both real X5OKQQ PDFs', () => {
    const ben = fileDoc('pdf-ben', 'X5OKQQ.pdf')
    ben.sourceMessageId = '1a068f623c9fe07b'
    const gal = fileDoc('pdf-gal', 'X5OKQQ.pdf')
    gal.sourceMessageId = '1a068f62222c52b9'
    const mixed = [...(usa.documents ?? []), ben, gal]
    const out = dropCoveredLinkDocuments(mixed)
    assert.equal(out.filter(d => d.filename === 'X5OKQQ.pdf').length, 2)
    assert.equal(out.some(d => d.sourceMessageId === '1a068f623c9fe07b' && isLinkOnlyDocument(d)), false)
    assert.equal(out.some(d => d.sourceMessageId === '1a068f62222c52b9' && isLinkOnlyDocument(d)), false)
    assert.equal(out.some(d => d.sourceMessageId === '1a075a7c145b4ea4'), true)
    assert.equal(out.some(d => d.sourceMessageId === '1a07f94b110c890e'), true)
    assert.equal(out.length, 5)
  })
})

describe('findGmailPlaceholder', () => {
  it('matches a cruise placeholder by thread id so the real PDF can replace it', () => {
    const card = linkDoc({
      id: 'cruise-1',
      filename: 'Cruise_Vacation_Receipt.pdf',
      sourceMessageId: '1a07f94b110c890e',
    })
    const hit = findGmailPlaceholder([card], { id: 'some-message', threadId: '1a07f94b110c890e' })
    assert.equal(hit?.id, 'cruise-1')
  })

  it('does not treat a real uploaded file as a placeholder', () => {
    const file = fileDoc('real', 'X5OKQQ.pdf')
    file.sourceMessageId = '1a068f623c9fe07b'
    const hit = findGmailPlaceholder([file], { id: '1a068f623c9fe07b' })
    assert.equal(hit, undefined)
  })
})
