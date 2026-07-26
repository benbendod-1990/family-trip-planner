// Fetches a trip's linked Google Doc as plain text.
//
// Why this lives in the worker and not the client: docs.google.com serves the
// export endpoint without CORS headers, so a browser fetch always fails. The
// worker has no such restriction.
//
// The Doc is link-shared ("anyone with the link"), which is why no OAuth or
// Drive scope is involved — but it also means this route would happily fetch
// ANY Google Doc if we let it. So the doc id is extracted with a strict regex
// and the outbound URL is rebuilt from scratch; the caller's URL is never
// passed through to fetch(). That keeps this from becoming an open proxy.

const DOC_ID = /^[A-Za-z0-9_-]{20,100}$/

export interface DocPullRequest {
  docUrl: string
}

export interface DocPullResponse {
  docId: string
  text: string
  fetchedAt: string
}

export type DocPullError = { error: string; detail?: string; status: number }

/** Pulls the doc id out of any of the URL shapes Google hands out. */
export function extractDocId(docUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(docUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname !== 'docs.google.com') return null

  // /document/d/<id>/edit   |   /document/d/<id>
  const fromPath = parsed.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([^/]+)/)
  const id = fromPath?.[1] ?? parsed.searchParams.get('id')
  if (!id || !DOC_ID.test(id)) return null
  return id
}

export async function pullDocText(body: DocPullRequest): Promise<DocPullResponse | DocPullError> {
  if (!body?.docUrl || typeof body.docUrl !== 'string') {
    return { error: 'bad_request', detail: 'body.docUrl (string) required', status: 400 }
  }
  const docId = extractDocId(body.docUrl)
  if (!docId) {
    return {
      error: 'bad_request',
      detail: 'docUrl must be an https://docs.google.com/document/d/<id> link',
      status: 400,
    }
  }

  const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'family-trip-planner/1.0' },
  })

  if (res.status === 401 || res.status === 403 || res.status === 404) {
    // Google redirects private docs to a sign-in page rather than 403ing, so
    // this mostly catches deleted docs — the sharing case is handled below.
    return {
      error: 'doc_not_accessible',
      detail: 'המסמך לא נגיש. ודא שהשיתוף שלו הוא "כל מי שיש לו הקישור".',
      status: 404,
    }
  }
  if (!res.ok) {
    return { error: 'upstream_error', detail: `Google returned ${res.status}`, status: 502 }
  }

  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()

  // A doc that isn't link-shared returns 200 with an HTML sign-in page.
  if (contentType.includes('text/html') || /<html[\s>]/i.test(text.slice(0, 500))) {
    return {
      error: 'doc_not_shared',
      detail: 'גוגל החזיר דף התחברות. שנה את שיתוף המסמך ל"כל מי שיש לו הקישור".',
      status: 403,
    }
  }

  return {
    docId,
    // Strip the UTF-8 BOM Google prefixes onto the txt export.
    text: text.replace(/^﻿/, ''),
    fetchedAt: new Date().toISOString(),
  }
}
