// Trip ↔ Google Doc sync check.
//
// The Doc is the source of truth. This pulls it and reports where the app's
// itinerary has drifted away from it; it deliberately does not rewrite the
// itinerary — see the reasoning at the top of tripDocDiff.ts.

import { pullTripDoc } from './aiClient'
import { diffDocAgainstTrip, type DocDiffResult } from './tripDocDiff'
import type { TripPlan } from '@/types/trip-plan'

export class DocSyncError extends Error {
  hint?: string

  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'DocSyncError'
    this.hint = hint
  }
}

/** Turns the worker's error payloads into something worth showing a human. */
function humanize(err: unknown): DocSyncError {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('doc_not_shared')) {
    return new DocSyncError(
      'גוגל לא נותן לקרוא את המסמך',
      'פתח את המסמך → שיתוף → "כל מי שיש לו הקישור" (מציג בלבד), ונסה שוב.',
    )
  }
  if (raw.includes('doc_not_accessible')) {
    return new DocSyncError('המסמך לא נמצא', 'ודא שהקישור נכון ושהמסמך לא נמחק.')
  }
  if (raw.includes('bad_request')) {
    return new DocSyncError(
      'הקישור לא נראה כמו קישור למסמך גוגל',
      'צריך קישור בצורה https://docs.google.com/document/d/...',
    )
  }
  if (raw.startsWith('AI 401') || raw.includes('unauthorized')) {
    return new DocSyncError('צריך להתחבר מחדש כדי לבדוק סנכרון')
  }
  return new DocSyncError('הבדיקה נכשלה', raw.slice(0, 200))
}

export async function checkDocSync(trip: TripPlan): Promise<DocDiffResult> {
  if (!trip.docUrl) {
    throw new DocSyncError('לא מקושר מסמך לטיול הזה', 'הדבק קישור למסמך התכנון כדי להשוות.')
  }
  try {
    const { text } = await pullTripDoc({ docUrl: trip.docUrl })
    return diffDocAgainstTrip(text, trip)
  } catch (err) {
    throw humanize(err)
  }
}

/** The Doc's own text, for reading the source of truth without leaving the app. */
export async function fetchDocText(docUrl: string): Promise<string> {
  try {
    const { text } = await pullTripDoc({ docUrl })
    return text
  } catch (err) {
    throw humanize(err)
  }
}
