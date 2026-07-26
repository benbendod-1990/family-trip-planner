// Compares a trip's itinerary against the plain text of its linked Google Doc.
//
// The Doc is the source of truth (see the project's doc-sync principle), but it
// is prose written by humans and Gemini-in-Docs — there is no structure to
// parse reliably. So this does NOT try to rebuild an itinerary from the Doc.
// It answers the narrower question that actually matters: *has the app drifted
// away from the Doc, and where?* Rewriting the itinerary stays a deliberate,
// reviewed act, because a bad automatic merge three weeks before the trip is
// far worse than a stale line.
//
// Method: anchor matching. Each day's events contribute "anchors" — venue names
// and other distinctive terms. The Doc is split into per-date sections. An
// anchor is OK if it appears in its own date's section, "moved" if it appears
// under a different date, and "missing" if the Doc never mentions it. The
// reverse sweep catches the opposite drift: venues the Doc names that the app
// has never heard of.

import type { TripPlan } from '@/types/trip-plan'

export type DocIssueKind = 'missing_from_doc' | 'moved_in_doc' | 'missing_from_app'

export interface DocIssue {
  kind: DocIssueKind
  /** Trip date the issue is attached to (YYYY-MM-DD). */
  date: string
  /** The venue / term the issue is about. */
  term: string
  /** For 'moved_in_doc': the date the Doc actually puts it under. */
  docDate?: string
  /** The event title the anchor came from, when it came from the app side. */
  eventTitle?: string
}

export interface DocDiffDay {
  date: string
  label: string
  /** Anchors that matched this day's Doc section. */
  matched: string[]
  issues: DocIssue[]
  status: 'in_sync' | 'drifted' | 'no_doc_section'
}

export interface DocDiffResult {
  /** True when no day drifted. */
  inSync: boolean
  days: DocDiffDay[]
  /** Every issue across all days, for a flat summary. */
  issues: DocIssue[]
  /** Dates present in the Doc, for diagnosing a Doc whose dates we misread. */
  docDates: string[]
  checkedAt: string
}

// ── text normalisation ──────────────────────────────────────────────────────

// Strip emoji, pictographs, arrows, then the variation selectors and ZWJ that
// glue emoji sequences together. The joiners are separate alternatives because
// a character class mixing them with base characters is genuinely ambiguous.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{FE0E}|\u{200D}/gu
const PUNCT = /[.,;:!?"'`´’‘“”()[\]{}<>|/\\–—_*#…־-]/g

export function normalize(s: string): string {
  return s
    .replace(EMOJI, ' ')
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Generic words that are never a venue. Kept deliberately small — an anchor
// that slips through shows up as one noisy line, while an over-eager stoplist
// hides real drift.
const STOP = new Set([
  // Hebrew connective / itinerary filler
  'נסיעה', 'נסיעת', 'חזרה', 'ארוחת', 'ארוחה', 'בוקר', 'צהריים', 'אחה', 'ערב', 'לילה',
  'יום', 'ימים', 'שעות', 'שעה', 'דקות', 'מסעדה', 'מסעדת', 'קלילה', 'קלים', 'רגועה',
  'מנוחה', 'התארגנות', 'אופציונלי', 'הוזמן', 'הוזמנה', 'קריטי', 'חובה', 'כרטיסים',
  'לכיוון', 'בדרך', 'בפארק', 'בווילה', 'בריזורט', 'לריזורט', 'מתקנים', 'המשך',
  'אריזות', 'אריזת', 'מזוודות', 'סופיות', 'בריכה', 'ובריכה', 'ואריזת', 'לבדוק',
  'מראש', 'אזור', 'ילדים', 'לילדים', 'לקטנטנים', 'החזרת', 'רכב', 'איסוף', 'נחיתה',
  'טיסה', 'שייט', 'ספארי', 'פארק', 'פינת', 'משחקים', 'אוכל', 'קניון', 'טירת',
  'מוזיאון', 'הליכה', 'תעלת', 'לאורך', 'חוות', 'העיזים', 'אורגנית', 'בחווה', 'ומזוודות',
  // Generic adjectives/nouns that are far too common to anchor on
  'מעולה', 'קליל', 'אחרונה', 'אחרון', 'חיות', 'המים', 'מסלול', 'חינמי', 'הריזורט',
  'צפונה', 'דרומה', 'חגיגית', 'מפנקת', 'חופשית', 'רגוע', 'ענק', 'גדול', 'קצרה',
  // Latin filler that shows up capitalised in the Doc
  'the', 'and', 'with', 'from', 'hotel', 'resort', 'park', 'restaurant', 'museum',
  'safari', 'kitchen', 'tip', 'tips',
])

/**
 * Distinctive terms from a piece of itinerary text.
 *
 * Latin runs come first — venue names in this Doc are Dutch/English and survive
 * translation, whereas the Hebrew around them is free prose. Hebrew words are
 * collected too, because the Doc and the app don't always agree on which script
 * a name is written in ("De Haar" vs "דה האר"), and an event whose Latin name
 * the Doc renders in Hebrew must not read as missing.
 */
export function anchorsFrom(text: string): string[] {
  const clean = normalize(text)
  const out: string[] = []

  // Latin runs of 4+ chars, joined when adjacent ("dinoland zwolle").
  const latin = clean.match(/[a-z][a-z’']*(?:\s+[a-z][a-z’']*)*/g) ?? []
  for (const run of latin) {
    const words = run.split(' ').filter(w => w.length >= 4 && !STOP.has(w))
    if (!words.length) continue
    // Prefer the longest contiguous phrase; also keep single words so a
    // reworded phrase still matches on its distinctive noun.
    if (words.length > 1) out.push(words.join(' '))
    for (const w of words) out.push(w)
  }

  const hebrew = clean.match(/[֐-׿]{4,}/g) ?? []
  for (const w of hebrew) if (!STOP.has(w)) out.push(w)

  return [...new Set(out)]
}

// Hebrew glues its prepositions onto the word — the app writes "לאוטרכט" where
// the Doc writes "אוטרכט". Try the bare stem too rather than calling that drift.
const HE_PREFIX = /^[לבמהושכ]/
const HEBREW = /^[֐-׿]/

function matchesIn(haystack: string, anchor: string): boolean {
  if (haystack.includes(anchor)) return true
  if (HEBREW.test(anchor) && HE_PREFIX.test(anchor) && anchor.length > 4) {
    return haystack.includes(anchor.slice(1))
  }
  return false
}

// ── Doc sectioning ─────────────────────────────────────────────────────────

/**
 * Splits the Doc into per-date chunks.
 *
 * The Doc mentions each date as `18.8` — in a quick-reference table first and
 * again in the prose detail below, so a date can open more than one chunk and
 * the chunks are concatenated. Anything before the first date lands in no
 * chunk, which is what we want (it's the header and the booking checklist).
 *
 * `validDates` gates which d.m tokens count as dates at all. Without it prose
 * like "בני 3 ו-4.5" (the kids' ages) opens a phantom 4 May section that
 * swallows the text after it.
 */
export function sectionDocByDate(
  docText: string,
  year: number,
  validDates?: Set<string>,
): Map<string, string> {
  const sections = new Map<string, string>()
  const re = /(?<!\d)(\d{1,2})\.(\d{1,2})(?!\d*\.\d)/g

  const marks: Array<{ date: string; index: number }> = []
  for (const m of docText.matchAll(re)) {
    const day = Number(m[1])
    const month = Number(m[2])
    if (day < 1 || day > 31 || month < 1 || month > 12) continue
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (validDates && !validDates.has(date)) continue
    marks.push({ date, index: m.index ?? 0 })
  }

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i]!.index
    const end = marks[i + 1]?.index ?? docText.length
    const chunk = docText.slice(start, end)
    const prev = sections.get(marks[i]!.date)
    sections.set(marks[i]!.date, prev ? `${prev}\n${chunk}` : chunk)
  }

  return sections
}

// ── the diff ───────────────────────────────────────────────────────────────

/** Latin venue-ish phrases the Doc names, for the reverse sweep. */
function docVenues(sectionText: string): string[] {
  const out = new Set<string>()
  // Capitalised Latin runs in the raw text — "Dinoland Zwolle", "Speelland".
  const runs = sectionText.match(/[A-Z][A-Za-z’']{3,}(?:\s+(?:[A-Z][A-Za-z’']{2,}|de|van|en|het))*/g) ?? []
  for (const run of runs) {
    const norm = normalize(run)
    const words = norm.split(' ').filter(w => w.length >= 4 && !STOP.has(w))
    if (words.length) out.add(norm)
  }
  return [...out]
}

export function diffDocAgainstTrip(docText: string, trip: TripPlan): DocDiffResult {
  const year = Number(trip.startDate.slice(0, 4))
  const sections = sectionDocByDate(docText, year, new Set(trip.days.map(d => d.date)))
  const normWholeDoc = normalize(docText)
  const normSections = new Map<string, string>()
  for (const [date, text] of sections) normSections.set(date, normalize(text))

  // Everything the app knows about, for the reverse sweep.
  const normTrip = normalize(
    trip.days
      .flatMap(d => d.events.map(e => `${e.title ?? ''} ${e.location ?? ''} ${e.description ?? ''}`))
      .concat(trip.accommodations.map(a => `${a.name} ${a.address ?? ''}`))
      .join(' ')
  )

  const days: DocDiffDay[] = []
  const allIssues: DocIssue[] = []

  for (const day of trip.days) {
    const section = normSections.get(day.date)
    const matched: string[] = []
    const issues: DocIssue[] = []

    if (section === undefined) {
      days.push({
        date: day.date,
        label: day.label ?? '',
        matched,
        issues,
        status: 'no_doc_section',
      })
      continue
    }

    for (const event of day.events) {
      // Transport is filler on the Doc's side — it gives drive times in a
      // column, not named "drive to X" entries. Checking them only produces
      // noise; the destination itself is checked via its own event.
      if (event.category === 'transport') continue

      const anchors = anchorsFrom(`${event.title ?? ''} ${event.location ?? ''}`)
      if (!anchors.length) continue

      // One hit is enough: an event is "present" if the Doc names any of its
      // distinctive terms under that date.
      const hit = anchors.find(a => matchesIn(section, a))
      if (hit) {
        matched.push(hit)
        continue
      }

      const elsewhere = anchors
        .map(a => {
          for (const [date, text] of normSections) {
            if (date !== day.date && matchesIn(text, a)) return { a, date }
          }
          return null
        })
        .find(Boolean)

      if (elsewhere) {
        issues.push({
          kind: 'moved_in_doc',
          date: day.date,
          term: elsewhere.a,
          docDate: elsewhere.date,
          eventTitle: event.title,
        })
        continue
      }

      // Last chance: the Doc mentions it outside any dated section (e.g. the
      // "must book now" checklist at the top). That's still "in the Doc".
      const anywhere = anchors.find(a => matchesIn(normWholeDoc, a))
      if (anywhere) {
        matched.push(anywhere)
        continue
      }

      issues.push({
        kind: 'missing_from_doc',
        date: day.date,
        term: anchors[0]!,
        eventTitle: event.title,
      })
    }

    // Reverse: venues the Doc puts on this date that the app never mentions.
    for (const venue of docVenues(sections.get(day.date) ?? '')) {
      if (normTrip.includes(venue)) continue
      // A multi-word phrase whose words are all known individually is a
      // rewording, not a new venue.
      const words = venue.split(' ')
      if (words.length > 1 && words.every(w => normTrip.includes(w))) continue
      issues.push({ kind: 'missing_from_app', date: day.date, term: venue })
    }

    days.push({
      date: day.date,
      label: day.label ?? '',
      matched,
      issues,
      status: issues.length ? 'drifted' : 'in_sync',
    })
    allIssues.push(...issues)
  }

  for (const d of days) if (d.status === 'no_doc_section') allIssues.push(...d.issues)

  return {
    inSync: days.every(d => d.status === 'in_sync'),
    days,
    issues: allIssues,
    docDates: [...sections.keys()].sort(),
    checkedAt: new Date().toISOString(),
  }
}
