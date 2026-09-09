// Collapse near-duplicate trips that sit next to a DEMO_TRIPS seed.
//
// Root cause: onRehydrateStorage injects missing seeds by id only. A family
// that already created "ארה״ב — מרץ 2027 (פלורידה משפחתי)" under a different
// UUID then receives the canonical usa-trip.json seed as a second Home card.
// Same bug waits for the next seed we ship.
//
// This module is a one-shot, idempotent pass: for each seed, drop other trips
// that share its destination family, overlapping dates, and a very similar
// title. Unique user data (tasks, budget, bookings, packing, extra family,
// documents) is copied onto the kept seed. Unrelated trips are never touched.
// One DEMO seed is never collapsed into another.

import type { TripPlan, TripDocument } from '@/types/trip-plan'
import type { TripTask } from '@/types/task'
import type { BudgetItem } from '@/types/budget'
import type { PackingItem } from '@/types/packing'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'
import type { FamilyMember } from '@/types/family'

export interface SeedIdentity {
  id: string
  name: string
  destination: string
  startDate: string
  endDate: string
}

// Header fields only — keep in sync with src/data/*-trip.json. Used by cloud
// merge to collapse near-duplicates without pulling the seed JSON into the
// supabase chunk.
export const CANONICAL_SEED_IDENTITIES: SeedIdentity[] = [
  {
    id: '34980c90-bd66-4270-8d45-3e96787b07ef',
    name: 'הולנד — אוגוסט 2026',
    destination: 'הולנד',
    startDate: '2026-08-18',
    endDate: '2026-08-27',
  },
  {
    id: 'a1f4e9b2-3c8d-4e6a-9b7c-1d5e8f7a2b34',
    name: 'פריז — אוקטובר 2026 (בן + גל)',
    destination: 'פריז, צרפת',
    startDate: '2026-10-15',
    endDate: '2026-10-19',
  },
  {
    id: 'b2c5f8a3-4d9e-4f1b-8c6a-7e2d5b9f3a18',
    name: 'כרתים — מאי 2026',
    destination: 'רתימנו, כרתים, יוון',
    startDate: '2026-05-21',
    endDate: '2026-05-24',
  },
  {
    id: '30a5d517-0db3-427f-adfa-92ef125e1f8f',
    name: 'רומא — נובמבר 2026',
    destination: 'רומא, איטליה',
    startDate: '2026-11-26',
    endDate: '2026-12-01',
  },
  {
    id: 'b38fc010-9096-45c9-b8df-191e369143dc',
    name: 'ארה״ב — מרץ 2027',
    destination: 'פלורידה, ארה״ב',
    startDate: '2027-03-19',
    endDate: '2027-04-02',
  },
]

export const CANONICAL_SEED_IDS = new Set(CANONICAL_SEED_IDENTITIES.map(s => s.id))

export interface CollapseResult {
  trips: TripPlan[]
  droppedIds: string[]
  /** dropped trip id → canonical seed id, so later cloud pulls stay collapsed. */
  redirects: Record<string, string>
}

const REDIRECTS_KEY = 'seed-duplicate-redirects'

export function loadSeedDuplicateRedirects(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(REDIRECTS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && k) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveSeedDuplicateRedirects(redirects: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return
  if (!Object.keys(redirects).length) return
  const merged = { ...loadSeedDuplicateRedirects(), ...redirects }
  localStorage.setItem(REDIRECTS_KEY, JSON.stringify(merged))
}

export function normalizeTripTitle(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["“”״'`׳]/g, '')
    .replace(/[—–−-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('he')
}

export function titlesAreSimilar(a: string, b: string): boolean {
  const na = normalizeTripTitle(a)
  const nb = normalizeTripTitle(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (shorter.length < 8) return false
  return longer.includes(shorter)
}

function destinationBlob(t: SeedIdentity): string {
  return `${t.destination} ${t.name}`
    .replace(/["“”״'`׳]/g, '')
    .toLocaleLowerCase('he')
}

export function sameDestinationFamily(a: SeedIdentity, b: SeedIdentity): boolean {
  const aBlob = destinationBlob(a)
  const bBlob = destinationBlob(b)
  const tokens = a.destination
    .split(/[,\s/|]+/)
    .map(tok => tok.replace(/["“”״'`׳]/g, '').toLocaleLowerCase('he').trim())
    .filter(tok => tok.length >= 3)
  if (tokens.some(tok => bBlob.includes(tok))) return true
  // USA/Florida family: Hebrew or Latin, so a California trip with a different
  // title still has to fail titlesAreSimilar before we would drop it.
  const usa = /פלורידה|florida|ארהב|usa|united states/
  return usa.test(aBlob) && usa.test(bBlob)
}

export function datesOverlap(a: SeedIdentity, b: SeedIdentity): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

export function isNearDuplicateOfSeed(
  trip: SeedIdentity,
  seed: SeedIdentity,
  seedIds: ReadonlySet<string>,
): boolean {
  if (trip.id === seed.id) return false
  if (seedIds.has(trip.id)) return false
  return (
    sameDestinationFamily(trip, seed) &&
    datesOverlap(trip, seed) &&
    titlesAreSimilar(trip.name, seed.name)
  )
}

function mergeTasks(kept: TripTask[], extra: TripTask[]): TripTask[] {
  const out = [...kept]
  const ids = new Set(out.map(t => t.id))
  const titles = new Map(out.map(t => [t.title.trim().toLocaleLowerCase('he'), t]))
  for (const task of extra) {
    const titleKey = task.title.trim().toLocaleLowerCase('he')
    if (ids.has(task.id)) {
      const i = out.findIndex(t => t.id === task.id)
      const cur = out[i]
      if (!cur.done && task.done) {
        out[i] = { ...cur, done: true, completedAt: task.completedAt ?? cur.completedAt }
      }
      continue
    }
    const twin = titles.get(titleKey)
    if (twin) {
      if (!twin.done && task.done) {
        const i = out.findIndex(t => t.id === twin.id)
        out[i] = { ...twin, done: true, completedAt: task.completedAt ?? twin.completedAt }
      }
      continue
    }
    ids.add(task.id)
    titles.set(titleKey, task)
    out.push(task)
  }
  return out
}

function mergeBudgetItems(kept: BudgetItem[], extra: BudgetItem[]): BudgetItem[] {
  const out = [...kept]
  const ids = new Set(out.map(i => i.id))
  const labels = new Set(out.map(i => i.label.trim().toLocaleLowerCase('he')))
  for (const item of extra) {
    if (ids.has(item.id) || labels.has(item.label.trim().toLocaleLowerCase('he'))) continue
    ids.add(item.id)
    labels.add(item.label.trim().toLocaleLowerCase('he'))
    out.push(item)
  }
  return out
}

function mergePacking(kept: PackingItem[], extra: PackingItem[]): PackingItem[] {
  const out = [...kept]
  const ids = new Set(out.map(i => i.id))
  const titles = new Map(out.map(i => [i.title.trim().toLocaleLowerCase('he'), i]))
  for (const item of extra) {
    if (ids.has(item.id)) continue
    const twin = titles.get(item.title.trim().toLocaleLowerCase('he'))
    if (twin) {
      if (!twin.packed && item.packed) {
        const i = out.findIndex(x => x.id === twin.id)
        out[i] = { ...twin, packed: true }
      }
      continue
    }
    ids.add(item.id)
    titles.set(item.title.trim().toLocaleLowerCase('he'), item)
    out.push(item)
  }
  return out
}

function flightKey(f: Flight): string {
  const pnr = (f.confirmationNumber ?? '').trim().toUpperCase()
  if (pnr) return `pnr:${pnr}|${(f.flightNumber ?? '').trim().toUpperCase()}`
  return `fn:${(f.flightNumber ?? '').trim().toUpperCase()}|${(f.departureAirport ?? '').toUpperCase()}|${(f.arrivalAirport ?? '').toUpperCase()}`
}

function hotelKey(a: Accommodation): string {
  const pnr = (a.confirmationNumber ?? '').trim().toUpperCase()
  if (pnr) return `pnr:${pnr}`
  return `h:${a.name.trim().toLocaleLowerCase('he')}|${a.checkIn}`
}

function carKey(c: CarRental): string {
  const pnr = (c.confirmationNumber ?? '').trim().toUpperCase()
  if (pnr) return `pnr:${pnr}`
  return `c:${c.company.trim().toLocaleLowerCase('he')}|${c.pickupDate}`
}

function mergeByKey<T extends { id: string }>(kept: T[], extra: T[], keyOf: (x: T) => string): T[] {
  const out = [...kept]
  const ids = new Set(out.map(x => x.id))
  const keys = new Set(out.map(keyOf).filter(Boolean))
  for (const item of extra) {
    if (ids.has(item.id)) continue
    const k = keyOf(item)
    if (k && keys.has(k)) continue
    ids.add(item.id)
    if (k) keys.add(k)
    out.push(item)
  }
  return out
}

function mergeFamily(kept: FamilyMember[], extra: FamilyMember[]): FamilyMember[] {
  const out = [...kept]
  const names = new Set(out.map(m => m.name.trim()))
  const ids = new Set(out.map(m => m.id))
  for (const m of extra) {
    if (ids.has(m.id) || names.has(m.name.trim())) continue
    ids.add(m.id)
    names.add(m.name.trim())
    out.push(m)
  }
  return out
}

function mergeDocuments(kept: TripDocument[] | undefined, extra: TripDocument[] | undefined): TripDocument[] | undefined {
  const a = kept ?? []
  const b = extra ?? []
  if (!a.length && !b.length) return kept
  const out = [...a]
  const ids = new Set(out.map(d => d.id))
  const hashes = new Set(out.map(d => d.sha256).filter(Boolean) as string[])
  for (const doc of b) {
    if (ids.has(doc.id)) continue
    if (doc.sha256 && hashes.has(doc.sha256)) continue
    ids.add(doc.id)
    if (doc.sha256) hashes.add(doc.sha256)
    out.push(doc)
  }
  return out
}

export function mergeUniqueUserData(kept: TripPlan, from: TripPlan): TripPlan {
  const tasks = mergeTasks(kept.tasks ?? [], from.tasks ?? [])
  const budgetItems = mergeBudgetItems(kept.budget?.items ?? [], from.budget?.items ?? [])
  const packingItems = mergePacking(kept.packingItems ?? [], from.packingItems ?? [])
  const flights = mergeByKey(kept.flights ?? [], from.flights ?? [], flightKey)
  const accommodations = mergeByKey(kept.accommodations ?? [], from.accommodations ?? [], hotelKey)
  const carRentals = mergeByKey(kept.carRentals ?? [], from.carRentals ?? [], carKey)
  const family = mergeFamily(kept.family ?? [], from.family ?? [])
  const documents = mergeDocuments(kept.documents, from.documents)

  const changed =
    tasks.length !== (kept.tasks ?? []).length ||
    budgetItems.length !== (kept.budget?.items ?? []).length ||
    packingItems.length !== (kept.packingItems ?? []).length ||
    flights.length !== (kept.flights ?? []).length ||
    accommodations.length !== (kept.accommodations ?? []).length ||
    carRentals.length !== (kept.carRentals ?? []).length ||
    family.length !== (kept.family ?? []).length ||
    (documents?.length ?? 0) !== (kept.documents?.length ?? 0) ||
    tasks.some((t, i) => t.done !== (kept.tasks ?? [])[i]?.done) ||
    packingItems.some((p, i) => p.packed !== (kept.packingItems ?? [])[i]?.packed)

  if (!changed) return kept
  return {
    ...kept,
    tasks,
    budget: { ...(kept.budget ?? { currency: 'ILS', totalBudget: 0, items: [] }), items: budgetItems },
    packingItems,
    flights,
    accommodations,
    carRentals,
    family,
    documents,
    docUrl: kept.docUrl ?? from.docUrl,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Inject any DEMO seed missing by id, then collapse near-duplicates onto the
 * canonical seed so Home never shows two copies of the same upcoming trip.
 */
export function ensureDemoTrips(
  trips: TripPlan[],
  seeds: TripPlan[],
  redirects: Record<string, string> = {},
): CollapseResult {
  const haveIds = new Set(trips.map(t => t.id))
  const missing = seeds.filter(s => !haveIds.has(s.id)).map(s => structuredClone(s))
  const next = missing.length ? [...trips, ...missing] : trips
  return collapseSeedNearDuplicates(next, seeds, redirects)
}

export function collapseSeedNearDuplicates(
  trips: TripPlan[],
  seeds: SeedIdentity[],
  redirects: Record<string, string> = {},
): CollapseResult {
  const seedIds = new Set(seeds.map(s => s.id))
  const nextRedirects: Record<string, string> = { ...redirects }
  const droppedIds: string[] = []

  let next = [...trips]

  for (const seed of seeds) {
    const kept = next.find(t => t.id === seed.id)
    if (!kept) continue

    const dups = next.filter(t => {
      if (t.id === seed.id) return false
      if (seedIds.has(t.id)) return false
      if (nextRedirects[t.id] === seed.id) return true
      return isNearDuplicateOfSeed(t, seed, seedIds)
    })
    if (!dups.length) continue

    let merged: TripPlan = kept
    for (const dup of dups) {
      merged = mergeUniqueUserData(merged, dup)
      droppedIds.push(dup.id)
      nextRedirects[dup.id] = seed.id
    }
    const drop = new Set(dups.map(d => d.id))
    next = next.map(t => (t.id === merged.id ? merged : t)).filter(t => !drop.has(t.id))
  }

  return { trips: next, droppedIds: [...new Set(droppedIds)], redirects: nextRedirects }
}
