import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripPlan } from '../types/trip-plan.ts'
import { tripToPayload } from './tripPayload.ts'
import {
  applyCanonicalSeedDocLink,
  docLinkFromCloudRow,
  ensureSeedDocLinks,
  HOLLAND_PLANNING_DOC_URL,
  HOLLAND_TRIP_ID,
  USA_PLANNING_DOC_TITLE,
  USA_PLANNING_DOC_URL,
  USA_TRIP_ID,
} from './seedDocLink.ts'

const usaSeed = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as TripPlan

const hollandSeed = JSON.parse(
  readFileSync(new URL('../data/holland-trip.json', import.meta.url), 'utf8'),
) as TripPlan

function stub(partial: Partial<TripPlan> & Pick<TripPlan, 'id'>): TripPlan {
  return {
    name: 'טיול',
    destination: 'פלורידה, ארה״ב',
    startDate: '2027-03-19',
    endDate: '2027-04-02',
    coverEmoji: '🇺🇸',
    family: [],
    tasks: [],
    days: [],
    budget: { currency: 'USD', totalBudget: 0, items: [] },
    accommodations: [],
    flights: [],
    carRentals: [],
    packingItems: [],
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...partial,
  }
}

describe('USA / Holland seed JSON still ship the planning Doc', () => {
  it('USA seed keeps the Drive URL and title', () => {
    assert.equal(usaSeed.id, USA_TRIP_ID)
    assert.equal(usaSeed.docUrl, USA_PLANNING_DOC_URL)
    assert.equal(usaSeed.docTitle, USA_PLANNING_DOC_TITLE)
    assert.match(usaSeed.docTitle ?? '', /ארה״ב 2027/)
  })

  it('Holland seed keeps its Doc URL', () => {
    assert.equal(hollandSeed.id, HOLLAND_TRIP_ID)
    assert.equal(hollandSeed.docUrl, HOLLAND_PLANNING_DOC_URL)
  })
})

describe('docLinkFromCloudRow — authenticated hydrate with no DB columns', () => {
  it('restores the USA planning Doc when cloud row has no doc_url', () => {
    const link = docLinkFromCloudRow({
      id: USA_TRIP_ID,
      name: 'ארה״ב — מרץ 2027',
    })
    assert.equal(link.docUrl, USA_PLANNING_DOC_URL)
    assert.equal(link.docTitle, USA_PLANNING_DOC_TITLE)
  })

  it('prefers persisted columns once migration 0010 is applied', () => {
    const link = docLinkFromCloudRow({
      id: USA_TRIP_ID,
      doc_url: 'https://docs.google.com/document/d/customDocId/edit',
      doc_title: 'עותק אחר',
    })
    assert.equal(link.docUrl, 'https://docs.google.com/document/d/customDocId/edit')
    assert.equal(link.docTitle, 'עותק אחר')
  })

  it('does not invent a Doc for an unknown trip id', () => {
    const link = docLinkFromCloudRow({ id: '11111111-2222-3333-4444-555555555555' })
    assert.equal(link.docUrl, undefined)
    assert.equal(link.docTitle, undefined)
  })
})

describe('ensureSeedDocLinks — invitee / empty persist after cloud pull', () => {
  it('fills docUrl on a remote-only USA trip that hydrate stripped', () => {
    const remoteOnly = stub({ id: USA_TRIP_ID, name: 'ארה״ב — מרץ 2027' })
    assert.equal(remoteOnly.docUrl, undefined)
    const [out] = ensureSeedDocLinks([remoteOnly])
    assert.equal(out?.docUrl, USA_PLANNING_DOC_URL)
    assert.equal(out?.docTitle, USA_PLANNING_DOC_TITLE)
  })

  it('is self-limiting once the link is present', () => {
    const once = ensureSeedDocLinks([stub({ id: USA_TRIP_ID })])
    const twice = ensureSeedDocLinks(once)
    assert.equal(twice[0]?.docUrl, once[0]?.docUrl)
    assert.equal(twice[0], once[0])
  })

  it('does not overwrite a user-set Doc URL', () => {
    const custom = 'https://docs.google.com/document/d/userPasted/edit'
    const out = applyCanonicalSeedDocLink(stub({ id: USA_TRIP_ID, docUrl: custom, docTitle: 'שלי' }))
    assert.equal(out.docUrl, custom)
    assert.equal(out.docTitle, 'שלי')
  })
})

describe('tripToPayload round-trips the Doc fields for save_trip', () => {
  it('includes doc_url and doc_title next to the other trip header fields', () => {
    const payload = tripToPayload(usaSeed)
    assert.equal(payload.doc_url, USA_PLANNING_DOC_URL)
    assert.equal(payload.doc_title, USA_PLANNING_DOC_TITLE)
  })
})

describe('call-site regressions', () => {
  it('cloud hydrate and signed-in wireUp restore the seed Doc link', () => {
    const repo = readFileSync(new URL('./tripRepo.ts', import.meta.url), 'utf8')
    const auth = readFileSync(new URL('./AuthContext.tsx', import.meta.url), 'utf8')
    const store = readFileSync(new URL('../stores/tripStore.ts', import.meta.url), 'utf8')
    const repair = readFileSync(new URL('./repairLiveSeedTrips.ts', import.meta.url), 'utf8')
    assert.ok(repo.includes('docLinkFromCloudRow'))
    assert.ok(repo.includes('ensureSeedDocLinks'))
    assert.ok(auth.includes('ensureSeedDocLinks'))
    assert.ok(repair.includes('ensureSeedDocLinks'))
    assert.ok(store.includes("import('@/lib/repairLiveSeedTrips')"))
  })
})
