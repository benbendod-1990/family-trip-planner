// Travel documents: the files behind TripPlan.documents.
//
// Bytes live in the private `trip-documents` Storage bucket (see migration
// 0006); the metadata rides inside the trip JSON so it reaches the other phone
// over the sync path that already exists. Object keys are
// `<tripId>/<documentId>-<filename>`, which is what the bucket's RLS policies
// authorise against.

import { supabase } from './supabase'
import { generateId } from '@/utils/id'
import type { TripDocument } from '@/types/trip-plan'

const BUCKET = 'trip-documents'

export class DocumentStoreError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'DocumentStoreError'
    this.hint = hint
  }
}

/** Storage rejects keys with spaces and non-ASCII, which Hebrew filenames have. */
function safeName(filename: string): string {
  const cleaned = filename.normalize('NFKD').replace(/[^\w.-]+/g, '_')
  return cleaned.slice(-80) || 'document'
}

function humanize(message: string, raw: string): DocumentStoreError {
  if (/bucket not found/i.test(raw)) {
    return new DocumentStoreError(
      'אחסון המסמכים לא הוגדר עדיין',
      'צריך להריץ את supabase/migrations/0006_trip_documents_storage.sql בפרויקט Supabase.',
    )
  }
  if (/row-level security|not authorized|403/i.test(raw)) {
    return new DocumentStoreError(
      'אין הרשאה למסמכי הטיול הזה',
      'רק חברי הטיול יכולים לראות את המסמכים. ודא שאתה מחובר עם המשתמש הנכון.',
    )
  }
  return new DocumentStoreError(message, raw.slice(0, 200))
}

export interface NewDocument {
  filename: string
  mimeType: string
  blob: Blob
  kind: TripDocument['kind']
  addedAt?: string
  sourceMessageId?: string
  sourceSubject?: string
  sourceFrom?: string
}

/** Uploads one file and returns the metadata row to store on the trip. */
export async function uploadDocument(
  tripId: string,
  doc: NewDocument,
): Promise<TripDocument> {
  const id = generateId()
  const path = `${tripId}/${id}-${safeName(doc.filename)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, doc.blob, { contentType: doc.mimeType, upsert: false })
  if (error) throw humanize('העלאת המסמך נכשלה', error.message)

  return {
    id,
    path,
    filename: doc.filename,
    mimeType: doc.mimeType,
    size: doc.blob.size,
    kind: doc.kind,
    addedAt: doc.addedAt ?? new Date().toISOString(),
    sourceMessageId: doc.sourceMessageId,
    sourceSubject: doc.sourceSubject,
    sourceFrom: doc.sourceFrom,
  }
}

/**
 * A short-lived URL for viewing a document. The bucket is private, so this is
 * the only way to render one — and the link expires, which is the point for
 * boarding passes and passport scans.
 */
export async function documentUrl(path: string, expiresInSec = 60 * 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error || !data?.signedUrl) {
    throw humanize('לא ניתן לפתוח את המסמך', error?.message ?? 'no signed url')
  }
  return data.signedUrl
}

export async function deleteDocument(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw humanize('מחיקת המסמך נכשלה', error.message)
}

/** Guess what a booking document is, so the list can group it. */
export function classifyDocument(subject: string, from: string, filename: string): TripDocument['kind'] {
  const hay = `${subject} ${from} ${filename}`.toLowerCase()
  if (/flight|airline|airways|e-?ticket|boarding|pnr|aegean|skyexpress|easyjet|טיסה|כרטיס/.test(hay)) return 'flight'
  if (/hotel|resort|booking\.com|airbnb|guesthouse|beeksebergen|stay|lodging|מלון|לינה/.test(hay)) return 'hotel'
  if (/car|rental|hertz|avis|europcar|sixt|budget|רכב|השכרת/.test(hay)) return 'car'
  if (/ticket|efteling|toverland|museum|tour|getyourguide|tiqets|כרטיסים|כניסה/.test(hay)) return 'activity'
  return 'other'
}
