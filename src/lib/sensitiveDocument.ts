// Passport / sensitive-document helpers. Kept free of the Supabase client so
// tests and the Node puller can import it without pulling the browser SDK.

import type { TripDocument } from '@/types/trip-plan'

export const REGULAR_DOC_BUCKET = 'trip-documents'
export const SENSITIVE_DOC_BUCKET = 'trip-sensitive-documents'

/** Object key for a passport slot that has metadata but no uploaded bytes. */
export const PENDING_PASSPORT_PREFIX = 'pending:passport'

/** Worker-minted passport URL lifetime. Short on purpose — the link is the secret. */
export const SENSITIVE_URL_TTL_SEC = 2 * 60

/** Boarding-pass / photo preview URL lifetime. Was 1 hour, which is a shareable leak. */
export const REGULAR_URL_TTL_SEC = 15 * 60

/** Client Face ID / device-credential session. Re-prompt after this. */
export const SENSITIVE_UNLOCK_TTL_MS = 10 * 60 * 1000

export const SENSITIVE_KINDS = ['passport'] as const
export type SensitiveDocumentKind = (typeof SENSITIVE_KINDS)[number]

export function isSensitiveKind(kind: TripDocument['kind'] | string | undefined): boolean {
  return kind === 'passport'
}

export function isPendingPassport(doc: Pick<TripDocument, 'kind' | 'path' | 'size'>): boolean {
  if (doc.kind !== 'passport') return false
  if (doc.path?.startsWith(PENDING_PASSPORT_PREFIX)) return true
  return !doc.path || doc.size === 0
}

export function hasPassportFile(doc: Pick<TripDocument, 'kind' | 'path' | 'size'>): boolean {
  return doc.kind === 'passport' && !isPendingPassport(doc)
}

export function storageBucketFor(doc: Pick<TripDocument, 'kind' | 'storageBucket'>): string {
  if (doc.storageBucket) return doc.storageBucket
  return isSensitiveKind(doc.kind) ? SENSITIVE_DOC_BUCKET : REGULAR_DOC_BUCKET
}

/**
 * Members never see passport rows. The storage key of an uploaded scan must
 * not ride in trip JSON / localStorage — that's how a stolen phone dumps paths.
 */
export function redactSensitiveDocument<T extends Pick<TripDocument, 'kind' | 'path'>>(doc: T): T {
  if (!isSensitiveKind(doc.kind)) return doc
  if (!doc.path || doc.path.startsWith(PENDING_PASSPORT_PREFIX) || doc.path.startsWith('external:')) {
    return doc
  }
  return { ...doc, path: '' }
}

export function documentsVisibleToViewer<T extends Pick<TripDocument, 'kind'>>(
  docs: T[] | undefined,
  isOwner: boolean,
): T[] {
  if (!docs?.length) return []
  if (isOwner) return docs
  return docs.filter(d => d.kind !== 'passport')
}

export function capSignedUrlTtl(kind: TripDocument['kind'] | undefined, requestedSec?: number): number {
  const max = isSensitiveKind(kind) ? SENSITIVE_URL_TTL_SEC : REGULAR_URL_TTL_SEC
  if (requestedSec == null || !Number.isFinite(requestedSec)) return max
  return Math.min(Math.max(30, Math.floor(requestedSec)), max)
}
