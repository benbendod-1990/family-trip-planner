import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TripPlan } from '../types/trip-plan.ts'
import { buildTripFrontPoster } from './tripFrontPoster.ts'
import { extractTripMapPois } from './tripMapPois.ts'
import { CANONICAL_SEED_IDENTITIES } from './dedupeDemoTrips.ts'

const ROME_ID = '30a5d517-0db3-427f-adfa-92ef125e1f8f'
const ROME_GAL_ID = '68bf0f50-7db8-4038-a757-18da7b931123'
const STALE_TICKET = /יש רק כרטיס אחד|אם גל\/הילדים מצטרפים/

const rome = JSON.parse(
  readFileSync(new URL('../data/rome-trip.json', import.meta.url), 'utf8'),
) as TripPlan
const paris = JSON.parse(
  readFileSync(new URL('../data/paris-trip.json', import.meta.url), 'utf8'),
) as TripPlan

describe('Rome seed is a Ben+Gal couple trip like Paris', () => {
  it('names the trip with the couple suffix and keeps Gal in family', () => {
    assert.equal(rome.id, ROME_ID)
    assert.equal(rome.name, 'רומא — נובמבר 2026 (בן + גל)')
    assert.match(paris.name, /\(בן \+ גל\)/)
    const names = (rome.family ?? []).map(m => m.name)
    assert.deepEqual(names, ['בן', 'גל'])
    const gal = rome.family.find(m => m.name === 'גל')
    assert.ok(gal)
    assert.equal(gal!.id, ROME_GAL_ID)
    assert.equal(gal!.emoji, '👩')
    assert.equal(gal!.isChild, false)
    const ben = rome.family.find(m => m.name === 'בן')
    assert.equal(ben?.emoji, '👨')
    assert.equal(ben?.isChild, false)
  })

  it('replaces the only-one-ticket task with a Gal booking follow-up', () => {
    const blob = JSON.stringify(rome)
    assert.equal(STALE_TICKET.test(blob), false, blob.match(STALE_TICKET)?.[0])
    const ticket = (rome.tasks ?? []).find(t => t.id === '42f26a51-3f8e-4604-87c4-6f711ecf7a9a')
    assert.ok(ticket)
    assert.match(ticket!.title, /גל/)
    assert.match(ticket!.title, /LY 383/)
    assert.match(ticket!.description ?? '', /ZYKJ6K/)
    assert.match(ticket!.description ?? '', /אין PNR|בלי להמציא|עדיין לא הוזמן/)
    assert.equal(/הילדים מצטרפים/.test(ticket!.description ?? ''), false)
  })

  it('keeps El Al LY 383 / LY 386 TLV↔FCO and Ben PNR ZYKJ6K', () => {
    const nums = (rome.flights ?? []).map(f => f.flightNumber).join(' ')
    assert.match(nums, /LY 383/)
    assert.match(nums, /LY 386/)
    assert.ok(rome.flights.every(f => f.confirmationNumber === 'ZYKJ6K'))
    assert.ok(rome.flights.some(f => f.departureAirport === 'TLV' && f.arrivalAirport === 'FCO'))
    assert.ok(rome.flights.some(f => f.departureAirport === 'FCO' && f.arrivalAirport === 'TLV'))
  })

  it('canonical Home identity stays in sync with the seed name', () => {
    const ident = CANONICAL_SEED_IDENTITIES.find(s => s.id === ROME_ID)
    assert.equal(ident?.name, rome.name)
  })
})

describe('Rome poster and map regenerate from the updated seed', () => {
  it('front poster still walks the Fiumicino days', () => {
    const poster = buildTripFrontPoster(rome)
    assert.ok(poster.stops.length >= 1)
    const blob = poster.stops.map(s => `${s.title} ${s.blurb}`).join(' | ')
    assert.match(blob, /fiumicino|פיומי|רומא|ly\s*383|ly\s*386/i)
    assert.match(poster.layout.roadD, /^M/)
  })

  it('map keeps Fiumicino and drops TLV', () => {
    const pois = extractTripMapPois(rome)
    assert.ok(pois.some(p => /fiumicino|פיומי/i.test(p.name)))
    assert.equal(pois.some(p => /נתב|gurion/i.test(p.name)), false)
  })
})

describe('Rome live-seed repair wiring', () => {
  it('adds Gal by name and never replaces the whole family array', () => {
    const src = readFileSync(new URL('./repairLiveSeedTrips.ts', import.meta.url), 'utf8')
    assert.match(src, /30a5d517-0db3-427f-adfa-92ef125e1f8f/)
    assert.match(src, /יש רק כרטיס אחד/)
    assert.match(src, /אם גל\\\/הילדים מצטרפים/)
    assert.match(src, /never[\s\S]{0,80}replace family wholesale|only add Gal if missing by name/)
    assert.match(src, /family: !hasGal && seedGal \? \[\.\.\.\(t\.family \?\? \[\]\), seedGal\] : t\.family/)
    assert.equal(src.includes('family: freshRome.family'), false)
    assert.equal(STALE_TICKET.test(JSON.stringify(rome)), false)
  })
})
