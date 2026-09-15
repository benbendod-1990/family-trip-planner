/**
 * Canonical USA Mar-2027 budget ledger.
 *
 * There is no auto-pull from the Google Doc for money (the Doc differ is
 * itinerary-only). This module is the seed that the Budget page and
 * `usa-trip.json` both read, so a later Doc/Gmail correction is one edit.
 *
 * Sources (do not invent transfers that are not here):
 * - Dorit / Gmail: El Al PNRs, RC receipts 3753418 / 3753537, packages Ben bought
 * - Planning Doc (Rami quotes live in the Doc table): Avner cabin 3753278 remaining
 * - Rami: whole-trip / parks / cruise-night *estimates* — not paid
 * - Tami WhatsApp: no dated «already paid» amounts, a «credit» with Avner
 *   without a figure, no person-to-person IOUs → settlements stay empty
 * - Ben override (authoritative vs the Doc cell): Avner covers the kids'
 *   Utopia share; adults on those cabins stay on their parents
 */

import type { Budget, BudgetCategory, BudgetItem } from '../types/budget'
import type { TripPlan } from '../types/trip-plan'

/** Keep in sync with `seedDocLink.USA_TRIP_ID` / `usa-trip.json`. */
export const USA_TRIP_ID = 'b38fc010-9096-45c9-b8df-191e369143dc'

/** Seed family ids — keep in sync with `usa-trip.json`. */
export const USA_MEMBERS = {
  ben: 'bd45bc64-1a3f-41b0-8580-105f52d537fe',
  gal: '5ce1491a-ebe2-45e3-afac-e079b561c0d6',
  avner: '2f092632-d025-4f27-8e35-48deb44371f6',
  rachel: '62900ff4-f78e-441f-a5a3-7939f4fc6963',
  agam: 'af55139a-8427-47f8-b01c-8619514cde97',
  shoval: '3b3fb68c-d03f-402b-9408-fff076e48fef',
  eden: '115d3582-0f7b-4234-b03b-4da4a92256d1',
  libi: 'a6fd600a-5a99-4833-9d9b-27fe256c334c',
  levi: 'd1c98c2a-5a1f-46b3-ba44-ca8434b82225',
  ari: '9cd15660-b514-41e1-bf7f-86fa402c36c7',
  liri: '790e86da-5a82-4017-a822-856c38508940',
  omer: '4161c66a-0ec9-434a-a662-dc2fa2f9b80a',
} as const

export type UsaBudgetSection = 'rule' | 'supplier' | 'estimate' | 'settlement'

export type UsaMoney =
  | { kind: 'usd'; amount: number }
  | { kind: 'tbd'; hint: string }

export interface UsaBudgetRule {
  id: string
  title: string
  body: string
  payer: string
  source: string
}

export interface UsaBudgetLine {
  id: string
  section: Exclude<UsaBudgetSection, 'rule'>
  category: BudgetCategory
  label: string
  money: UsaMoney
  /**
   * Remaining unpaid to a supplier. Never treat as a family-to-family transfer.
   * When set, `money` is the unpaid remainder (not the original fare).
   */
  remainingDue?: boolean
  /** Confirmed money that already left an account, with a supplier receipt. */
  paidToSupplier?: boolean
  paidBy?: string
  payerLabel: string
  dueDate?: string
  notes: string
  source: string
}

export const USA_BUDGET_CURRENCY = 'USD'

/** Rami frame — label as estimate, never as paid. */
export const USA_BUDGET_FRAME = {
  withCruiseUsd: 38100,
  withoutCruiseUsd: 32000,
  source: 'רמי — אומדן מסגרת לכל הטיול, לא שולם',
} as const

export const USA_PAYMENT_RULES: UsaBudgetRule[] = [
  {
    id: 'rule-avner-self-rachel',
    title: 'אבנר («אבא» / המיטיב) — הוא ורחל',
    body: 'אבנר משלם על עצמו ועל רחל: טיסות, ולינת התא שלהם בקרוז (הזמנה 3753278, תא 10549).',
    payer: 'אבנר',
    source: 'מסמך התכנון · טבלת תשלומים לפי משפחה',
  },
  {
    id: 'rule-avner-grandkids-flights',
    title: 'טיסות הנכדים',
    body: 'אבנר משלם את טיסות הנכדים (עומר, ארי, לביא, לירי — PNR X5G7DK, הועבר מאבא). הסכום המדויק מה-PDF עדיין לא ביד — שורה נפרדת כ-TBD.',
    payer: 'אבנר',
    source: 'מסמך התכנון + דורית/Gmail (PNR)',
  },
  {
    id: 'rule-avner-orlando',
    title: 'לינה באורלנדו + אוכל בבית',
    body: 'אבנר משלם לינת הנכדים בווילה באורלנדו, ואוכל בית / וילה (לא מסעדות). משקי הבית מכסים את חלק המבוגרים שלהם בלינה — סכום יחסי עדיין TBD, הווילות לא הוזמנו.',
    payer: 'אבנר (נכדים + אוכל בית) · משקי בית (מבוגרים, יחסי)',
    source: 'מסמך התכנון · טבלת תשלומים לפי משפחה',
  },
  {
    id: 'rule-avner-cars',
    title: 'רכבים גדולים לקבוצה',
    body: 'אבנר משלם על הרכב/ים הגדולים לקבוצה. ב-WhatsApp עלתה אפשרות לפיצול בן+עדן מול אבנר+אגם — בלי סכום. מוצג כהערה פתוחה, לא כחוב.',
    payer: 'אבנר · פיצול אפשרי TBD',
    source: 'מסמך התכנון + Tami (WhatsApp, בלי סכום)',
  },
  {
    id: 'rule-avner-parks',
    title: 'כרטיסי פארקים לכל הקבוצה',
    body: 'אבנר משלם כרטיסי פארק לכולם, כולל כל הילדים. תינוקת (לירי) בחינם. עדיין לא נקנו — האומדן של רמי בנפרד, לא יתרה לספק.',
    payer: 'אבנר',
    source: 'מסמך התכנון · טבלת תשלומים לפי משפחה',
  },
  {
    id: 'rule-kids-cruise-ben-override',
    title: 'חלק הילדים בקרוז Utopia — החלטת בן',
    body: 'אבנר מכסה את חלק הילדים בקרוז: עומר+ארי בהזמנה 3753418, לביא+לירי בהזמנה 3753537. המבוגרים באותם תאים נשארים על ההורים (בן+גל / עדן+ליבי). טבלת המסמך עדיין כותבת «לינת הנכדים בקרוז על ההורים» — זה תא ישן; הכלל כאן הוא של בן.',
    payer: 'אבנר (ילדים) · בן+גל / עדן+ליבי (מבוגרים)',
    source: 'החלטת בן (override) · לא תא המסמך הישן',
  },
  {
    id: 'rule-households',
    title: 'משקי הבית',
    body: 'בן+גל, עדן+ליבי, אגם+שובל: כל משק בית משלם טיסות המבוגרים שלו ולינת הקרוז של המבוגרים שלו.',
    payer: 'כל משק בית על המבוגרים שלו',
    source: 'מסמך התכנון · טבלת תשלומים לפי משפחה',
  },
  {
    id: 'rule-tbd-who-pays',
    title: 'עדיין לא הוכרע מי משלם',
    body: 'ESTA, ביטוח נסיעות, מסעדות, וחבילות שתייה/אינטרנט בקרוז — לא סגור מי מכסה. חבילות שבן כבר קנה (Refreshment + VOOM) הן עלות שלו עד שיוחלט אחרת.',
    payer: 'TBD',
    source: 'בקשת בן · אין הסכם בכתובים',
  },
]

export const USA_SUPPLIER_LINES: UsaBudgetLine[] = [
  {
    id: 'a38fc010-b004-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'accommodation',
    label: 'Royal Caribbean 3753418 — בן+גל+עומר+ארי',
    money: { kind: 'usd', amount: 3126.6 },
    remainingDue: true,
    paidBy: USA_MEMBERS.ben,
    payerLabel: 'יתרה לספק · מבוגרים על בן+גל, ילדים על אבנר (פיצול תעריף TBD)',
    dueDate: '2027-01-06',
    notes: 'יתרה שלא שולמה לספק, לא העברה בין בני משפחה. פיצול מבוגרים/ילדים בתוך התא עדיין לא ידוע מהקבלה.',
    source: 'דורית / Gmail · Cruise_Vacation_Receipt 3753418',
  },
  {
    id: 'a38fc010-b005-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'accommodation',
    label: 'Royal Caribbean 3753537 — עדן+ליבי+לביא+לירי',
    money: { kind: 'usd', amount: 3126.6 },
    remainingDue: true,
    paidBy: USA_MEMBERS.eden,
    payerLabel: 'יתרה לספק · מבוגרים על עדן+ליבי, ילדים על אבנר (פיצול תעריף TBD)',
    notes: 'יתרה שלא שולמה לספק. תאריך אחרון לתשלום לא צוין בקבלה שביד — לא ממציאים דדליין.',
    source: 'דורית / Gmail · הזמנה 3753537',
  },
  {
    id: 'a38fc010-b006-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'accommodation',
    label: 'Royal Caribbean 3753278 — אבנר+רחל תא 10549',
    money: { kind: 'usd', amount: 1586.8 },
    remainingDue: true,
    paidBy: USA_MEMBERS.avner,
    payerLabel: 'אבנר',
    dueDate: '2027-01-06',
    notes: 'יתרה לספק אחרי פיקדון $200. הסכום במסמך התכנון (~$1,586.80).',
    source: 'מסמך התכנון (רמי/דורית) · הזמנה 3753278',
  },
  {
    id: 'a38fc010-b007-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'accommodation',
    label: 'פיקדון RC 3753278 — אבנר+רחל',
    money: { kind: 'usd', amount: 200 },
    paidToSupplier: true,
    paidBy: USA_MEMBERS.avner,
    payerLabel: 'אבנר · שולם לספק',
    notes: 'פיקדון $200 ששולם לרויאל קריביאן. לא העברה בין בני משפחה.',
    source: 'מסמך התכנון · הזמנה 3753278',
  },
  {
    id: 'a38fc010-b001-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'flights',
    label: 'אל על LY17/LY18 — בן · X5OKQQ',
    money: { kind: 'usd', amount: 1228 },
    paidBy: USA_MEMBERS.ben,
    payerLabel: 'משק בית בן+גל (טיסת מבוגר)',
    notes: 'עלות ידועה ≈ $1,228 לאדם. הוזמן (LY17 19.3 / LY18 1.4). אין כאן אישור תשלום מתוארך — מתוכנן, לא «שולם בפועל».',
    source: 'דורית / Gmail · PNR X5OKQQ',
  },
  {
    id: 'a38fc010-b002-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'flights',
    label: 'אל על LY17/LY18 — גל · X5OKQQ',
    money: { kind: 'usd', amount: 1228 },
    paidBy: USA_MEMBERS.gal,
    payerLabel: 'משק בית בן+גל (טיסת מבוגר)',
    notes: 'עלות ידועה ≈ $1,228 לאדם. הוזמן. אין תאריך «שולם» — מתוכנן בלבד.',
    source: 'דורית / Gmail · PNR X5OKQQ',
  },
  {
    id: 'a38fc010-b003-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'flights',
    label: 'אל על LY17/LY18 — ילדים · X5G7DK',
    money: { kind: 'tbd', hint: 'הועבר מאבא · סכום PDF לא ידוע' },
    paidBy: USA_MEMBERS.avner,
    payerLabel: 'אבנר (טיסות נכדים)',
    notes: 'PNR X5G7DK (לביא, ארי, לירי, עומר). הועבר מאבא. בלי סכום מהאישור — לא ממציאים.',
    source: 'דורית / Gmail · PNR X5G7DK',
  },
  {
    id: 'a38fc010-b008-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'food',
    label: 'RC Refreshment Package — בן',
    money: { kind: 'usd', amount: 146.24 },
    paidToSupplier: true,
    paidBy: USA_MEMBERS.ben,
    payerLabel: 'בן · עלות שלו עד שיוחלט אחרת',
    notes: 'נקנה. מי משלם חבילות שתייה ככלל עדיין TBD; השורה הזו היא הקנייה של בן.',
    source: 'דורית / Gmail · Cruise Planner',
  },
  {
    id: 'a38fc010-b009-45c9-b8df-191e369143dc',
    section: 'supplier',
    category: 'other',
    label: 'RC VOOM אינטרנט — בן',
    money: { kind: 'usd', amount: 87.96 },
    paidToSupplier: true,
    paidBy: USA_MEMBERS.ben,
    payerLabel: 'בן · עלות שלו עד שיוחלט אחרת',
    notes: 'נקנה. חבילות אינטרנט ככלל עדיין TBD מי מכסה; השורה הזו היא הקנייה של בן.',
    source: 'דורית / Gmail · Cruise Planner',
  },
  {
    id: '63b9876b-64f9-4f5a-8b8e-f1138f7c2558',
    section: 'supplier',
    category: 'accommodation',
    label: 'וילה אורלנדו 19–22.3 (Solterra / Village at Solterra)',
    money: { kind: 'tbd', hint: 'לא הוזמן' },
    payerLabel: 'אבנר (נכדים) · משקי בית (מבוגרים, יחסי)',
    notes: 'לא הוזמן. 3 לילות ל-12. אין יתרה לספק כי אין הזמנה.',
    source: 'מסמך התכנון',
  },
  {
    id: '9fc81d6f-5863-40af-83fd-17fcc3c0a7a7',
    section: 'supplier',
    category: 'accommodation',
    label: 'וילה אורלנדו חלק ב׳ 26.3–1.4 (Solterra / Windsor Hills)',
    money: { kind: 'tbd', hint: 'לא הוזמן' },
    payerLabel: 'אבנר (נכדים) · משקי בית (מבוגרים, יחסי)',
    notes: 'לא הוזמן. 6 לילות אחרי הקרוז.',
    source: 'מסמך התכנון',
  },
  {
    id: '8e7827e6-a59c-4f23-a2d8-f81b83c03828',
    section: 'supplier',
    category: 'accommodation',
    label: 'לילה ליד MIA ב-31.3 — רק אם לא יוצאים ב-04:30',
    money: { kind: 'tbd', hint: 'אופציה פתוחה' },
    payerLabel: 'TBD',
    notes: 'ברירת המחדל: שינה בווילה באורלנדו ב-31.3 ויציאה 04:30 ל-MIA.',
    source: 'מסמך התכנון',
  },
  {
    id: '6f843b42-c63f-4c9b-9814-62e48b8cb888',
    section: 'supplier',
    category: 'transport',
    label: 'רכבים — MIA→אורלנדו/נמל + נמל→MIA',
    money: { kind: 'tbd', hint: 'לא הוזמן · פיצול אפשרי בלי סכום' },
    payerLabel: 'אבנר · פיצול בן+עדן מול אבנר+אגם הוזכר ב-WhatsApp בלי סכום',
    notes: 'לא הוזמן. הכלל: אבנר על הרכב/ים הגדולים. Tami: אפשרות פיצול בן+עדן מול אבנר+אגם — בלי סכום, לא IOU.',
    source: 'מסמך התכנון + Tami (WhatsApp)',
  },
  {
    id: 'afcf34e7-a44b-4965-ba13-76c5216c3eb1',
    section: 'supplier',
    category: 'activities',
    label: 'כרטיסי פארקים — דיסני / SeaWorld / Peppa / Gatorland',
    money: { kind: 'tbd', hint: 'לא נקנה · אומדן רמי בנפרד' },
    paidBy: USA_MEMBERS.avner,
    payerLabel: 'אבנר לכל הקבוצה (תינוקת בחינם)',
    notes: 'מתוכנן, לא נקנה. אין יתרה לספק. אומדן 4/5 ימים אצל רמי בסעיף האומדנים.',
    source: 'מסמך התכנון',
  },
  {
    id: '993bf1cf-abc3-4e31-ad33-1c59a5a972c4',
    section: 'supplier',
    category: 'other',
    label: 'ESTA ×12',
    money: { kind: 'tbd', hint: 'מי משלם לא הוכרע' },
    payerLabel: 'TBD',
    notes: 'חובה לכל 12 הנוסעים. לא סגור מי מכסה.',
    source: 'מסמך התכנון + בקשת בן',
  },
  {
    id: 'e0a028a2-a1c3-4a72-b3a5-d2ae2d5c902e',
    section: 'supplier',
    category: 'other',
    label: 'ביטוח נסיעות',
    money: { kind: 'tbd', hint: 'מי משלם לא הוכרע' },
    payerLabel: 'TBD',
    notes: 'לא ביטוח קבוצתי במסמך. מי משלם — פתוח.',
    source: 'מסמך התכנון + בקשת בן',
  },
]

export const USA_ESTIMATE_LINES: UsaBudgetLine[] = [
  {
    id: 'est-frame-with-cruise',
    section: 'estimate',
    category: 'other',
    label: 'מסגרת כל הטיול — עם Utopia',
    money: { kind: 'usd', amount: USA_BUDGET_FRAME.withCruiseUsd },
    payerLabel: 'אומדן רמי · לא שולם',
    notes: 'כולל קרוז. לא יתרה לספק ולא העברה ששולמה.',
    source: USA_BUDGET_FRAME.source,
  },
  {
    id: 'est-frame-without-cruise',
    section: 'estimate',
    category: 'other',
    label: 'מסגרת כל הטיול — בלי קרוז',
    money: { kind: 'usd', amount: USA_BUDGET_FRAME.withoutCruiseUsd },
    payerLabel: 'אומדן רמי · לא שולם',
    notes: 'בלי Utopia. לא שולם.',
    source: USA_BUDGET_FRAME.source,
  },
  {
    id: 'est-parks-4d',
    section: 'estimate',
    category: 'activities',
    label: 'פארקים 4 ימים (7 מבוגרים + 3 ילדים)',
    money: { kind: 'usd', amount: 7280 },
    payerLabel: 'אומדן רמי · אבנר לפי הכלל · לא נקנה',
    notes: 'מספר הראשים הוא של רמי (לא ספירה מחדש של 12 הנפשות). תינוקת בחינם לפי הכלל.',
    source: 'רמי — אומדן',
  },
  {
    id: 'est-parks-5d',
    section: 'estimate',
    category: 'activities',
    label: 'פארקים 5 ימים (7 מבוגרים + 3 ילדים)',
    money: { kind: 'usd', amount: 7880 },
    payerLabel: 'אומדן רמי · אבנר לפי הכלל · לא נקנה',
    notes: 'חלופה ל-4 ימים. לא נקנה.',
    source: 'רמי — אומדן',
  },
  {
    id: 'est-cruise-night-adult',
    section: 'estimate',
    category: 'accommodation',
    label: 'לילת קרוז למבוגר (WhatsApp)',
    money: { kind: 'usd', amount: 1000 },
    payerLabel: 'אומדן שיחה · לא תעריף הזמנה',
    notes: 'שיחה ב-WhatsApp על ~$1,000 ללילה למבוגר. האומדן הזה אינו יתרת 3753418/3753537.',
    source: 'WhatsApp — אומדן בלבד',
  },
  {
    id: 'est-cruise-night-child',
    section: 'estimate',
    category: 'accommodation',
    label: 'לילת קרוז לילד (WhatsApp)',
    money: { kind: 'usd', amount: 500 },
    payerLabel: 'אומדן שיחה · לא תעריף הזמנה',
    notes: 'שיחה ב-WhatsApp על ~$500 ללילה לילד. לא מחליף את יתרות הספק.',
    source: 'WhatsApp — אומדן בלבד',
  },
]

/** Person-to-person IOUs — empty on purpose. Tami chat had none. */
export const USA_SETTLEMENT_LINES: UsaBudgetLine[] = []

export const USA_SETTLEMENT_HONESTY = {
  title: 'אין התחשבנות בין בני המשפחה עדיין',
  body: 'סיכום Tami (WhatsApp): אין סכומי «כבר שולם» עם תאריך לטיול 2027, הוזכר «אשראי» מול אבנר בלי סכום, ואין IOU מפורש מאדם לאדם בשיחה. לא ממציאים העברות. כשיהיה הסכם עם סכום — כאן.',
  source: 'Tami — סיכום WhatsApp',
} as const

/** Combined placeholder lines the first USA seed shipped — content-staleness markers. */
export const STALE_USA_BUDGET_ITEM_IDS = new Set([
  'b735a7f8-778a-4d32-a093-65b7a9930a57',
  '27e88588-6a7a-4118-adcd-c685e797c122',
])

export const STALE_USA_BUDGET_LABEL = /X5OKQQ \+ X5G7DK|Utopia of the Seas 4 לילות · 3 תאים/

function lineToItem(line: UsaBudgetLine): BudgetItem {
  const usd = line.money.kind === 'usd' ? line.money.amount : 0
  const hint = line.money.kind === 'tbd' ? line.money.hint : undefined
  const flags = [
    line.remainingDue ? 'יתרה לספק' : undefined,
    line.paidToSupplier ? 'שולם לספק' : undefined,
    hint,
  ].filter(Boolean)
  const notes = [flags.length ? flags.join(' · ') : undefined, line.notes, `מקור: ${line.source}`]
    .filter(Boolean)
    .join(' — ')
  const item: BudgetItem = {
    id: line.id,
    category: line.category,
    label: line.label,
    planned: usd,
    notes,
  }
  if (line.paidToSupplier) item.actual = usd
  if (line.dueDate) item.date = line.dueDate
  if (line.paidBy) item.paidBy = line.paidBy
  return item
}

/** Seed budget for the USA trip — supplier/known lines only; estimates stay in the overlay. */
export function buildUsaSeedBudget(): Budget {
  return {
    currency: USA_BUDGET_CURRENCY,
    totalBudget: USA_BUDGET_FRAME.withCruiseUsd,
    items: USA_SUPPLIER_LINES.map(lineToItem),
  }
}

export const USA_BUDGET_SEED_ITEM_IDS = new Set(USA_SUPPLIER_LINES.map(l => l.id))

export function withUsaSeedBudget<T extends { id: string; budget: Budget }>(trip: T): T {
  if (trip.id !== USA_TRIP_ID) return trip
  return { ...trip, budget: buildUsaSeedBudget() }
}

export function isStaleUsaBudget(trip: Pick<TripPlan, 'id' | 'budget'>): boolean {
  if (trip.id !== USA_TRIP_ID) return false
  const items = trip.budget?.items ?? []
  const labels = items.map(i => i.label).join('\n')
  if (STALE_USA_BUDGET_LABEL.test(labels)) return true
  if (!items.some(i => /3753418/.test(i.label))) return true
  const allZero =
    (trip.budget?.totalBudget ?? 0) === 0 &&
    items.every(i => (i.planned ?? 0) === 0 && i.actual == null)
  return allZero
}

export function applyUsaBudgetRepair(trip: TripPlan, seedBudget = buildUsaSeedBudget()): TripPlan {
  if (trip.id !== USA_TRIP_ID) return trip
  if (!isStaleUsaBudget(trip)) return trip
  const live = trip.budget?.items ?? []
  const liveById = new Map(live.map(i => [i.id, i]))
  const nextItems: BudgetItem[] = [
    ...seedBudget.items.map(s => {
      const prev = liveById.get(s.id)
      if (!prev) return s
      if (prev.actual != null && prev.actual > 0 && (s.actual == null || s.actual === 0)) {
        return { ...s, actual: prev.actual }
      }
      return s
    }),
    ...live.filter(i => !USA_BUDGET_SEED_ITEM_IDS.has(i.id) && !STALE_USA_BUDGET_ITEM_IDS.has(i.id)),
  ]
  return {
    ...trip,
    budget: {
      currency: USA_BUDGET_CURRENCY,
      totalBudget:
        (trip.budget?.totalBudget ?? 0) > 0 ? trip.budget.totalBudget : seedBudget.totalBudget,
      items: nextItems,
    },
    updatedAt: new Date().toISOString(),
  }
}

export function usdAmount(money: UsaMoney): number | undefined {
  return money.kind === 'usd' ? money.amount : undefined
}

export function usaSupplierRemainingUsd(lines = USA_SUPPLIER_LINES): number {
  return lines.reduce((s, l) => (l.remainingDue ? s + (usdAmount(l.money) ?? 0) : s), 0)
}

export function usaPaidToSupplierUsd(lines = USA_SUPPLIER_LINES): number {
  return lines.reduce((s, l) => (l.paidToSupplier ? s + (usdAmount(l.money) ?? 0) : s), 0)
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
