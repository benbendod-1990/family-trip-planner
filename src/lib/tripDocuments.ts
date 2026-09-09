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
import { documentHref, encodeLinkPath, isLinkOnlyDocument } from './seedBookingDocuments'

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

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Uploads one file and returns the metadata row to store on the trip.
 *
 * The metadata also goes to `trip_documents`, which is what the other phone
 * reads. It deliberately does NOT ride inside the trip JSON: save_trip() has no
 * documents key and would drop it, which is exactly how the documents tab
 * stayed empty on the second device (see migration 0007).
 */
export async function uploadDocument(
  tripId: string,
  doc: NewDocument,
): Promise<TripDocument> {
  const id = generateId()
  const path = `${tripId}/${id}-${safeName(doc.filename)}`
  const sha256 = await sha256Hex(doc.blob)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, doc.blob, { contentType: doc.mimeType, upsert: false })
  if (error) throw humanize('העלאת המסמך נכשלה', error.message)

  const record: TripDocument = {
    id,
    path,
    filename: doc.filename,
    mimeType: doc.mimeType,
    size: doc.blob.size,
    sha256,
    kind: doc.kind,
    addedAt: doc.addedAt ?? new Date().toISOString(),
    sourceMessageId: doc.sourceMessageId,
    sourceSubject: doc.sourceSubject,
    sourceFrom: doc.sourceFrom,
  }

  const { error: rowError } = await supabase.from('trip_documents').insert({
    id,
    trip_id: tripId,
    path,
    filename: record.filename,
    mime_type: record.mimeType,
    size: record.size,
    kind: record.kind,
    sha256,
    source_message_id: record.sourceMessageId ?? null,
    source_subject: record.sourceSubject ?? null,
    source_from: record.sourceFrom ?? null,
    added_at: record.addedAt,
  })
  if (rowError) {
    // 23505 = the dedup index fired: this trip already holds these exact bytes.
    // The object we just wrote is the redundant one, so take it back out.
    if (rowError.code === '23505') {
      await supabase.storage.from(BUCKET).remove([path])
      throw new DocumentStoreError('המסמך הזה כבר קיים בטיול', doc.filename)
    }
    throw humanize('שמירת פרטי המסמך נכשלה', rowError.message)
  }

  return record
}

/** Every document filed against a trip, newest first. */
export async function listDocuments(tripId: string): Promise<TripDocument[]> {
  const { data, error } = await supabase
    .from('trip_documents')
    .select('*')
    .eq('trip_id', tripId)
    .order('added_at', { ascending: false })
  if (error) throw humanize('טעינת המסמכים נכשלה', error.message)
  return (data ?? []).map(rowToDocument)
}

export function rowToDocument(r: Record<string, unknown>): TripDocument {
  const path = r.path as string
  const url = documentHref({ path }) ?? undefined
  return {
    id: r.id as string,
    path,
    filename: r.filename as string,
    mimeType: r.mime_type as string,
    size: Number(r.size ?? 0),
    sha256: (r.sha256 as string) ?? undefined,
    kind: r.kind as TripDocument['kind'],
    addedAt: r.added_at as string,
    sourceMessageId: (r.source_message_id as string) ?? undefined,
    sourceSubject: (r.source_subject as string) ?? undefined,
    sourceFrom: (r.source_from as string) ?? undefined,
    url,
  }
}

/**
 * A short-lived URL for viewing a document. The bucket is private, so this is
 * the only way to render one — and the link expires, which is the point for
 * boarding passes and passport scans.
 */
export async function documentUrl(doc: TripDocument | string, expiresInSec = 60 * 60): Promise<string> {
  const asDoc = typeof doc === 'string' ? { path: doc, url: undefined } : doc
  const href = documentHref(asDoc)
  if (href) return href
  const path = typeof doc === 'string' ? doc : doc.path
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error || !data?.signedUrl) {
    throw humanize('לא ניתן לפתוח את המסמך', error?.message ?? 'no signed url')
  }
  return data.signedUrl
}

export async function deleteDocument(doc: TripDocument): Promise<void> {
  if (!isLinkOnlyDocument(doc) && doc.path) {
    const { error } = await supabase.storage.from(BUCKET).remove([doc.path])
    if (error) throw humanize('מחיקת המסמך נכשלה', error.message)
  }
  // The row is what the other phone reads, so it has to go too — otherwise the
  // document reappears there pointing at bytes that no longer exist.
  const { error: rowError } = await supabase.from('trip_documents').delete().eq('id', doc.id)
  if (rowError) throw humanize('מחיקת פרטי המסמך נכשלה', rowError.message)
}

/**
 * Upsert link-only seed cards into trip_documents so the spouse's phone sees
 * them through the server-wins path. Failures are ignored — the cards still
 * live locally, and the trip may not be in Supabase yet.
 */
export async function persistLinkDocuments(tripId: string, docs: TripDocument[]): Promise<void> {
  const rows = docs.filter(isLinkOnlyDocument).map(doc => ({
    id: doc.id,
    trip_id: tripId,
    path: doc.path.startsWith('external:') ? doc.path : encodeLinkPath(documentHref(doc) ?? doc.path),
    filename: doc.filename,
    mime_type: doc.mimeType,
    size: doc.size,
    kind: doc.kind,
    sha256: doc.sha256 ?? null,
    source_message_id: doc.sourceMessageId ?? null,
    source_subject: doc.sourceSubject ?? null,
    source_from: doc.sourceFrom ?? null,
    added_at: doc.addedAt,
  }))
  if (!rows.length) return
  const { error } = await supabase.from('trip_documents').upsert(rows, { onConflict: 'id' })
  if (error) {
    console.warn('[tripDocuments] persistLinkDocuments failed:', error.message)
  }
}

// Lives in its own module so the Node-side puller can share it — see the note
// at the top of lib/documentKind.
export { classifyDocument } from './documentKind'
