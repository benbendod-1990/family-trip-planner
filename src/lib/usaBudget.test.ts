import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Budget, BudgetItem } from '../types/budget.ts'
import type { TripPlan } from '../types/trip-plan.ts'
import { USA_TRIP_ID as DOC_USA_ID } from './seedDocLink.ts'
import {
  applyUsaBudgetRepair,
  buildUsaSeedBudget,
  formatUsd,
  isStaleUsaBudget,
  STALE_USA_BUDGET_ITEM_IDS,
  STALE_USA_BUDGET_LABEL,
  USA_BUDGET_FRAME,
  USA_BUDGET_SEED_ITEM_IDS,
  USA_COUPLE_SETTLEMENTS,
  USA_ESTIMATE_LINES,
  USA_MEMBERS,
  USA_PAYMENT_RULES,
  USA_SETTLEMENT_HONESTY,
  USA_SETTLEMENT_LINES,
  USA_SUPPLIER_LINES,
  USA_TRIP_ID,
  usaMoneyHeadlines,
  usaOweAvnerHasAmount,
  usaPaidToSupplierUsd,
  usaSupplierRemainingUsd,
} from '../data/usaBudget.ts'

const usa = JSON.parse(
  readFileSync(new URL('../data/usa-trip.json', import.meta.url), 'utf8'),
) as TripPlan

function stubUsa(budget: Budget, extra?: Partial<TripPlan>): TripPlan {
  return {
    ...usa,
    budget,
    ...extra,
  }
}

describe('USA Mar 2027 budget ledger', () => {
  it('keeps the canonical trip id in sync', () => {
    assert.equal(USA_TRIP_ID, 'b38fc010-9096-45c9-b8df-191e369143dc')
    assert.equal(USA_TRIP_ID, DOC_USA_ID)
    assert.equal(usa.id, USA_TRIP_ID)
  })

  it('seed JSON matches the typed module and does not ship a whole-trip envelope', () => {
    const built = buildUsaSeedBudget()
    assert.deepEqual(usa.budget, built)
    assert.equal(usa.budget.currency, 'USD')
    assert.equal(usa.budget.totalBudget, 0)
    assert.notEqual(usa.budget.totalBudget, USA_BUDGET_FRAME.withCruiseUsd)
    assert.equal(STALE_USA_BUDGET_LABEL.test(usa.budget.items.map(i => i.label).join('\n')), false)
    for (const id of STALE_USA_BUDGET_ITEM_IDS) {
      assert.equal(usa.budget.items.some(i => i.id === id), false)
    }
  })

  it('answers the three money-page headlines without a $38k hero', () => {
    const h = usaMoneyHeadlines()
    assert.equal(h.paidSoFarUsd, 200 + 146.24 + 87.96)
    assert.equal(h.oweAvnerLabel, 'טרם ידוע')
    assert.equal(usaOweAvnerHasAmount(), false)
    assert.equal(h.remainingKnownUsd, 3126.6 + 3126.6 + 1586.8)
    assert.equal(h.unconfirmedAdultFlightsUsd, 1228 * 2)
    assert.equal(h.parksEstimateLowUsd, 7280)
    assert.equal(h.parksEstimateHighUsd, 7880)
    const ui = readFileSync(new URL('../pages/Budget.tsx', import.meta.url), 'utf8')
    assert.match(ui, /כמה עלה עד עכשיו/)
    assert.match(ui, /מה צריך לשלם לאבנר פר זוג/)
    assert.match(ui, /כמה נשאר לשלם \(צפוי\)/)
    assert.equal(/מסגרת עם קרוז/.test(ui), false)
    assert.equal(/USA_BUDGET_FRAME\.withCruiseUsd/.test(ui), false)
  })

  it('exposes RC remaining balances and does not treat them as family IOUs', () => {
    const labels = usa.budget.items.map(i => i.label).join('\n')
    assert.match(labels, /3753418/)
    assert.match(labels, /3753537/)
    assert.match(labels, /3753278/)
    const a = usa.budget.items.find(i => /3753418/.test(i.label))!
    const b = usa.budget.items.find(i => /3753537/.test(i.label))!
    const c = usa.budget.items.find(i => /3753278/.test(i.label) && i.planned > 200)!
    assert.equal(a.planned, 3126.6)
    assert.equal('actual' in a, false)
    assert.equal(a.actual, undefined)
    assert.equal(a.date, '2027-01-06')
    assert.equal(b.planned, 3126.6)
    assert.equal(b.actual, undefined)
    assert.equal(c.planned, 1586.8)
    assert.equal(usaSupplierRemainingUsd(), 3126.6 + 3126.6 + 1586.8)
    assert.match(a.notes ?? '', /יתרה לספק/)
    assert.equal(/WhatsApp.*שולם|העברה בין בני משפחה ששולמה/.test(JSON.stringify(USA_SUPPLIER_LINES)), false)
  })

  it('records Ben/Gal flight amounts and leaves kids flights TBD', () => {
    const ben = usa.budget.items.find(i => i.id === 'a38fc010-b001-45c9-b8df-191e369143dc')!
    const gal = usa.budget.items.find(i => i.id === 'a38fc010-b002-45c9-b8df-191e369143dc')!
    const kids = usa.budget.items.find(i => i.id === 'a38fc010-b003-45c9-b8df-191e369143dc')!
    assert.equal(ben.planned, 1228)
    assert.equal(ben.paidBy, USA_MEMBERS.ben)
    assert.equal(ben.actual, undefined)
    assert.equal(gal.planned, 1228)
    assert.equal(kids.planned, 0)
    assert.match(kids.notes ?? '', /TBD|לא ידוע/)
  })

  it('records known supplier payments only (deposit + Ben packages)', () => {
    assert.equal(usaPaidToSupplierUsd(), 200 + 146.24 + 87.96)
    const refresh = usa.budget.items.find(i => /Refreshment/.test(i.label))!
    const voom = usa.budget.items.find(i => /VOOM/.test(i.label))!
    const deposit = usa.budget.items.find(i => /פיקדון RC 3753278/.test(i.label))!
    assert.equal(refresh.actual, 146.24)
    assert.equal(voom.actual, 87.96)
    assert.equal(deposit.actual, 200)
    assert.equal(refresh.paidBy, USA_MEMBERS.ben)
    assert.equal(deposit.paidBy, USA_MEMBERS.avner)
  })

  it('keeps payment rules and a Ben kids-cruise override', () => {
    assert.ok(USA_PAYMENT_RULES.some(r => r.id === 'rule-kids-cruise-ben-override'))
    const kidsCruise = USA_PAYMENT_RULES.find(r => r.id === 'rule-kids-cruise-ben-override')!
    assert.match(kidsCruise.body, /3753418/)
    assert.match(kidsCruise.body, /3753537/)
    assert.match(kidsCruise.body, /אבנר/)
    assert.match(kidsCruise.source, /החלטת בן/)
    assert.ok(USA_PAYMENT_RULES.some(r => /TBD/.test(r.payer) && /ESTA/.test(r.body)))
  })

  it('keeps Rami parks figures as estimates and demotes the $32k/$38k envelope', () => {
    assert.equal(USA_ESTIMATE_LINES.length, 2)
    assert.equal(USA_ESTIMATE_LINES.some(l => l.money.kind === 'usd' && l.money.amount === 7280), true)
    assert.equal(USA_ESTIMATE_LINES.some(l => l.money.kind === 'usd' && l.money.amount === 7880), true)
    assert.equal(USA_ESTIMATE_LINES.some(l => l.money.kind === 'usd' && l.money.amount === 38100), false)
    assert.equal(USA_ESTIMATE_LINES.some(l => l.money.kind === 'usd' && l.money.amount === 32000), false)
    assert.equal(USA_ESTIMATE_LINES.some(l => l.money.kind === 'usd' && l.money.amount === 1000), false)
    assert.equal(USA_ESTIMATE_LINES.some(l => l.money.kind === 'usd' && l.money.amount === 500), false)
    for (const line of USA_ESTIMATE_LINES) {
      assert.equal(USA_BUDGET_SEED_ITEM_IDS.has(line.id), false, line.id)
    }
  })

  it('shows per-couple Avner formulas without invented dollar amounts', () => {
    assert.deepEqual(USA_COUPLE_SETTLEMENTS.map(c => c.label), ['בן+גל', 'עדן+ליבי', 'אגם+שובל'])
    for (const couple of USA_COUPLE_SETTLEMENTS) {
      assert.equal(couple.oweAvner.length > 0, true)
      assert.equal(couple.oweAvner.every(l => l.money.kind === 'tbd'), true)
      assert.ok(couple.oweAvner.some(l => /פארקים/.test(l.label)))
    }
    const ledger = readFileSync(new URL('../components/budget/UsaBudgetLedger.tsx', import.meta.url), 'utf8')
    assert.match(ledger, /USA_COUPLE_SETTLEMENTS/)
    assert.match(ledger, /כללי תשלום/)
    assert.match(ledger, /USA_SETTLEMENT_HONESTY/)
  })

  it('does not invent WhatsApp settlements', () => {
    assert.equal(USA_SETTLEMENT_LINES.length, 0)
    assert.match(USA_SETTLEMENT_HONESTY.body, /אין העברה מפורשת מאדם לאדם/)
    assert.equal(usa.budget.items.some(i => /התחשבנות|חייב ל[א-ת]/.test(`${i.label} ${i.notes ?? ''}`)), false)
  })

  it('formats cents so RC remainders are not rounded to whole dollars', () => {
    assert.match(formatUsd(3126.6), /3,126\.60|3\.126,60/)
  })
})

describe('USA live budget repair', () => {
  it('detects the old $0 combined placeholders as stale', () => {
    const staleItems: BudgetItem[] = [
      {
        id: 'b735a7f8-778a-4d32-a093-65b7a9930a57',
        category: 'flights',
        label: 'אל על LY17/LY18 — X5OKQQ + X5G7DK',
        planned: 0,
      },
      {
        id: '27e88588-6a7a-4118-adcd-c685e797c122',
        category: 'accommodation',
        label: 'Utopia of the Seas 4 לילות · 3 תאים · 22–26.3',
        planned: 0,
      },
    ]
    const stale = stubUsa({ currency: 'USD', totalBudget: 0, items: staleItems })
    assert.equal(isStaleUsaBudget(stale), true)
    const fixed = applyUsaBudgetRepair(stale)
    assert.equal(isStaleUsaBudget(fixed), false)
    assert.equal(fixed.budget.totalBudget, 0)
    assert.ok(fixed.budget.items.some(i => /3753418/.test(i.label) && i.planned === 3126.6))
    assert.equal(fixed.budget.items.some(i => STALE_USA_BUDGET_ITEM_IDS.has(i.id)), false)
  })

  it('rewrites a live copy that still carries Rami’s $38,100 envelope as totalBudget', () => {
    const envelope = stubUsa({
      ...buildUsaSeedBudget(),
      totalBudget: USA_BUDGET_FRAME.withCruiseUsd,
    })
    assert.equal(isStaleUsaBudget(envelope), true)
    const fixed = applyUsaBudgetRepair(envelope)
    assert.equal(fixed.budget.totalBudget, 0)
    assert.equal(isStaleUsaBudget(fixed), false)
    assert.ok(fixed.budget.items.some(i => /3753418/.test(i.label)))
  })

  it('keeps a user-added expense across repair', () => {
    const extra: BudgetItem = {
      id: 'user-snack-1',
      category: 'food',
      label: 'חטיפים לשדה',
      planned: 40,
      actual: 40,
    }
    const stale = stubUsa({
      currency: 'USD',
      totalBudget: 0,
      items: [
        {
          id: 'b735a7f8-778a-4d32-a093-65b7a9930a57',
          category: 'flights',
          label: 'אל על LY17/LY18 — X5OKQQ + X5G7DK',
          planned: 0,
        },
        extra,
      ],
    })
    const fixed = applyUsaBudgetRepair(stale)
    assert.ok(fixed.budget.items.some(i => i.id === 'user-snack-1' && i.actual === 40))
  })

  it('repairLiveSeedTrips wires the USA budget one-shot', () => {
    const src = readFileSync(new URL('./repairLiveSeedTrips.ts', import.meta.url), 'utf8')
    assert.match(src, /applyUsaBudgetRepair/)
    const stale = stubUsa({
      currency: 'USD',
      totalBudget: 0,
      items: [{
        id: 'b735a7f8-778a-4d32-a093-65b7a9930a57',
        category: 'flights',
        label: 'אל על LY17/LY18 — X5OKQQ + X5G7DK',
        planned: 0,
      }],
    })
    const out = applyUsaBudgetRepair(stale)
    assert.equal(out.budget.totalBudget, 0)
    assert.ok(out.budget.items.some(i => /3753418/.test(i.label)))
  })
})
