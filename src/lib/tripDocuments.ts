// Travel documents: the files behind TripPlan.documents.
//
// Regular files live in the private `trip-documents` bucket (migration 0006).
// Passport scans live in `trip-sensitive-documents` (0016). Neither bucket
// grants authenticated SELECT, so the browser cannot mint signed URLs.
// The Worker is the only signer: ≤15 min for regular files, 2 min + a
// server-verified WebAuthn assertion for passports. Passport rows are
// trip-owner only.

import { supabase } from './supabase'
import { generateId } from '@/utils/id'
import type { TripDocument } from '@/types/trip-plan'
import { documentHref, encodeLinkPath, isLinkOnlyDocument, isPersistableSeedDocument } from './seedBookingDocuments'
import { workerAuthHeaders } from './workerAuth'
import { ensureSensitiveUnlocked, WebAuthnRequiredError } from './webauthnUnlock'
import {
  REGULAR_DOC_BUCKET,
  SENSITIVE_DOC_BUCKET,
  isPendingPassport,
  isSensitiveKind,
  redactSensitiveDocument,
  storageBucketFor,
} from './sensitiveDocument'

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
  if (/bucket not found/i.test(raw) || /does not exist/i.test(raw)) {
    return new DocumentStoreError(
      'אחסון המסמכים לא הוגדר עדיין',
      'צריך להריץ את supabase/migrations/0016_sensitive_documents.sql בפרויקט Supabase.',
    )
  }
  if (/row-level security|not authorized|403/i.test(raw)) {
    return new DocumentStoreError(
      'אין הרשאה למסמך הזה',
      'דרכונים שמורים ליוצרי הטיול. מסמכים רגילים — לכל חבר בטיול.',
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
  /** Reuse a seed passport slot id so the placeholder becomes the real file. */
  id?: string
  personId?: string
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function toInsertRow(tripId: string, record: TripDocument): Record<string, unknown> {
  return {
    id: record.id,
    trip_id: tripId,
    path: record.path,
    filename: record.filename,
    mime_type: record.mimeType,
    size: record.size,
    kind: record.kind,
    sha256: record.sha256 ?? null,
    source_message_id: record.sourceMessageId ?? null,
    source_subject: record.sourceSubject ?? null,
    source_from: record.sourceFrom ?? null,
    added_at: record.addedAt,
    storage_bucket: storageBucketFor(record),
    person_id: record.personId ?? null,
  }
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
  const id = doc.id || generateId()
  const bucket = storageBucketFor({ kind: doc.kind })
  const path = `${tripId}/${id}-${safeName(doc.filename)}`
  const sha256 = await sha256Hex(doc.blob)

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, doc.blob, { contentType: doc.mimeType, upsert: false })
  if (error) throw humanize('העלאת המסמך נכשלה', error.message)

  const record: TripDocument = redactSensitiveDocument({
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
    storageBucket: bucket === SENSITIVE_DOC_BUCKET ? SENSITIVE_DOC_BUCKET : REGULAR_DOC_BUCKET,
    personId: doc.personId,
  })

  const row = toInsertRow(tripId, { ...record, path })
  const { error: rowError } = await supabase
    .from('trip_documents')
    .upsert(row, { onConflict: 'id' })
  if (rowError) {
    // 23505 = the dedup index fired: this trip already holds these exact bytes.
    // The object we just wrote is the redundant one, so take it back out.
    if (rowError.code === '23505') {
      await supabase.storage.from(bucket).remove([path])
      throw new DocumentStoreError('המסמך הזה כבר קיים בטיול', doc.filename)
    }
    throw humanize('שמירת פרטי המסמך נכשלה', rowError.message)
  }

  return record
}

/** Every document filed against a trip, newest first. */
export async function listDocuments(tripId: string): Promise<TripDocument[]> {
  const rpc = await supabase.rpc('list_trip_documents', { _trip_id: tripId })
  if (!rpc.error) {
    return ((rpc.data ?? []) as Record<string, unknown>[])
      .map(rowToDocument)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }
  const { data, error } = await supabase
    .from('trip_documents')
    .select('*')
    .eq('trip_id', tripId)
    .order('added_at', { ascending: false })
  if (error) throw humanize('טעינת המסמכים נכשלה', error.message)
  return (data ?? []).map(rowToDocument)
}

export function rowToDocument(r: Record<string, unknown>): TripDocument {
  const path = (r.path as string) ?? ''
  const url = documentHref({ path }) ?? undefined
  const bucketRaw = r.storage_bucket as TripDocument['storageBucket'] | undefined
  return redactSensitiveDocument({
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
    storageBucket: bucketRaw === SENSITIVE_DOC_BUCKET ? SENSITIVE_DOC_BUCKET : REGULAR_DOC_BUCKET,
    personId: (r.person_id as string) ?? undefined,
  })
}

const AI_BASE = import.meta.env.VITE_AI_BASE_URL ?? 'http://localhost:8787'

async function signViaWorker(documentId: string): Promise<string> {
  const res = await fetch(`${AI_BASE}/api/documents/sign`, {
    method: 'POST',
    headers: await workerAuthHeaders(),
    body: JSON.stringify({ documentId }),
  })
  if (res.status === 403) {
    const t = await res.text().catch(() => '')
    if (/webauthn_required|passport_assertion_required/.test(t)) {
      throw new WebAuthnRequiredError()
    }
    throw humanize('רק יוצרי הטיול יכולים לפתוח דרכונים', `${res.status} ${t}`)
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw humanize('לא ניתן לפתוח את המסמך', `${res.status} ${t}`)
  }
  const body = (await res.json()) as { signed_url?: string }
  if (!body.signed_url) throw humanize('לא ניתן לפתוח את המסמך', 'no signed url')
  return body.signed_url
}

async function currentUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user?.id) return null
  return { id: user.id, email: user.email ?? 'user' }
}

/**
 * A short-lived URL for viewing a document. Always minted by the Worker —
 * the client never calls createSignedUrl. Passports additionally require a
 * server-verified WebAuthn assertion (2-minute URL). Regular files: 15 min.
 */
export async function documentUrl(doc: TripDocument | string, _expiresInSec?: number): Promise<string> {
  if (typeof doc === 'string') {
    const href = documentHref({ path: doc, url: undefined })
    if (href) return href
    throw new DocumentStoreError('לא ניתן לפתוח את המסמך בלי מזהה. רענן את העמוד.')
  }

  const href = documentHref(doc)
  if (href) return href
  if (isPendingPassport(doc)) {
    throw new DocumentStoreError('עדיין אין קובץ דרכון — רק מקום שמור')
  }
  if (!doc.path && !isSensitiveKind(doc.kind)) {
    throw new DocumentStoreError('לא ניתן לפתוח את המסמך', 'missing path')
  }

  try {
    return await signViaWorker(doc.id)
  } catch (e) {
    if (!(e instanceof WebAuthnRequiredError)) throw e
    const user = await currentUser()
    if (!user) throw new DocumentStoreError('צריך להתחבר כדי לפתוח דרכון')
    await ensureSensitiveUnlocked(user.id, user.email)
    return signViaWorker(doc.id)
  }
}

export async function deleteDocument(doc: TripDocument): Promise<void> {
  const pending = isPendingPassport(doc) || isLinkOnlyDocument(doc) || !doc.path
  if (!pending) {
    const bucket = storageBucketFor(doc)
    const { error } = await supabase.storage.from(bucket).remove([doc.path])
    if (error) throw humanize('מחיקת המסמך נכשלה', error.message)
  }
  // The row is what the other phone reads, so it has to go too — otherwise the
  // document reappears there pointing at bytes that no longer exist.
  const { error: rowError } = await supabase.from('trip_documents').delete().eq('id', doc.id)
  if (rowError) throw humanize('מחיקת פרטי המסמך נכשלה', rowError.message)
}

/**
 * Upsert seed cards (booking links + empty passport slots) into trip_documents
 * so the spouse's phone sees them through the server-wins path. Failures are
 * ignored — the cards still live locally, and the trip may not be in Supabase yet.
 */
export async function persistLinkDocuments(tripId: string, docs: TripDocument[]): Promise<void> {
  const rows = docs.filter(isPersistableSeedDocument).map(doc => ({
    id: doc.id,
    trip_id: tripId,
    path: isLinkOnlyDocument(doc)
      ? (doc.path.startsWith('external:') ? doc.path : encodeLinkPath(documentHref(doc) ?? doc.path))
      : doc.path,
    filename: doc.filename,
    mime_type: doc.mimeType,
    size: doc.size,
    kind: doc.kind,
    sha256: doc.sha256 ?? null,
    source_message_id: doc.sourceMessageId ?? null,
    source_subject: doc.sourceSubject ?? null,
    source_from: doc.sourceFrom ?? null,
    added_at: doc.addedAt,
    storage_bucket: storageBucketFor(doc),
    person_id: doc.personId ?? null,
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
