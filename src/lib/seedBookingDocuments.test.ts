import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripDocument, TripPlan } from '../types/trip-plan.ts'
import {
  documentHref,
  ensureSeedBookingDocuments,
  isLinkOnlyDocument,
  mergeServerDocuments,
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
  it('ships three link-only cards for the known El Al PNRs and Utopia sailing', () => {
    const docs = usa.documents ?? []
    assert.equal(docs.length, 3)
    assert.ok(docs.every(isLinkOnlyDocument))
    assert.ok(docs.every(d => d.size === 0 && d.mimeType === 'text/uri-list'))
    const names = docs.map(d => d.filename).join(' ')
    assert.match(names, /X5OKQQ/)
    assert.match(names, /X5G7DK/)
    assert.match(names, /Utopia/)
    assert.ok(docs.every(d => documentHref(d)?.startsWith('https://')))
  })

  it('does not invent PDF bytes', () => {
    for (const d of usa.documents ?? []) {
      assert.equal(d.mimeType.startsWith('application/pdf'), false)
      assert.equal((d.path ?? '').includes('.pdf'), false)
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
})

describe('ensureSeedBookingDocuments', () => {
  it('injects missing USA booking cards onto a live trip that has none', () => {
    const live: TripPlan = { ...usa, documents: [] }
    const out = ensureSeedBookingDocuments([live], [usa])
    assert.equal((out[0]?.documents ?? []).length, 3)
    assert.ok((out[0]?.documents ?? []).some(d => d.filename.includes('X5OKQQ')))
  })

  it('is self-limiting once the seed cards are present', () => {
    const once = ensureSeedBookingDocuments([{ ...usa, documents: [] }], [usa])
    const twice = ensureSeedBookingDocuments(once, [usa])
    assert.equal((twice[0]?.documents ?? []).length, (once[0]?.documents ?? []).length)
  })
})
