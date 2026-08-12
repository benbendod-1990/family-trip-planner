// Google Docs API client: token refresh + the two calls we actually need.
// Zero dependencies — Node 18+ has global fetch.

import { readSecret } from './keychain.mjs'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DOCS_API = 'https://docs.googleapis.com/v1/documents'

export const SCOPE = 'https://www.googleapis.com/auth/documents'

let cached = { token: null, expiresAt: 0 }

export class SetupError extends Error {}

export function loadClientCreds() {
  const clientId = readSecret('client_id')
  const clientSecret = readSecret('client_secret')
  if (!clientId || !clientSecret) {
    throw new SetupError(
      'Google OAuth client not configured. Run:\n' +
        '  node tools/mcp-google-docs/setup-auth.mjs',
    )
  }
  return { clientId, clientSecret }
}

/**
 * Mints an access token from the stored refresh token, reusing the cached one
 * while it still has >60s of life.
 */
export async function getAccessToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60_000) return cached.token

  const { clientId, clientSecret } = loadClientCreds()
  const refreshToken = readSecret('refresh_token')
  if (!refreshToken) {
    throw new SetupError(
      'No refresh token in Keychain. Run:\n  node tools/mcp-google-docs/setup-auth.mjs',
    )
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    // invalid_grant = the refresh token died. In a Testing-mode OAuth app that
    // happens every 7 days; see README.
    if (/invalid_grant/i.test(text)) {
      throw new SetupError(
        'Refresh token was revoked or expired (Google expires them after 7 days ' +
          'while the OAuth app is in Testing mode). Re-run:\n' +
          '  node tools/mcp-google-docs/setup-auth.mjs',
      )
    }
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const tok = JSON.parse(text)
  cached = {
    token: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  }
  return cached.token
}

async function apiCall(path, init = {}) {
  const token = await getAccessToken()
  const res = await fetch(`${DOCS_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 600)
    try {
      detail = JSON.parse(text).error?.message ?? detail
    } catch {
      /* keep raw */
    }
    throw new Error(`Docs API ${res.status}: ${detail}`)
  }
  return text ? JSON.parse(text) : {}
}

export function getDocument(documentId) {
  return apiCall(`/${encodeURIComponent(documentId)}`)
}

export function batchUpdate(documentId, requests) {
  return apiCall(`/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })
}

/**
 * Flattens a document into addressable text blocks.
 *
 * Google returns a deep tree; for editing what matters is "what text is where",
 * including inside table cells — the Holland doc keeps half its itinerary in a
 * table, so skipping tables would hide the rows we need to change.
 */
export function extractBlocks(doc) {
  const out = []

  const walk = (elements, location) => {
    for (const el of elements ?? []) {
      if (el.paragraph) {
        const text = (el.paragraph.elements ?? [])
          .map((e) => e.textRun?.content ?? '')
          .join('')
        if (text.trim()) {
          out.push({
            start: el.startIndex,
            end: el.endIndex,
            location,
            style: el.paragraph.paragraphStyle?.namedStyleType ?? null,
            text: text.replace(/\n$/, ''),
          })
        }
      } else if (el.table) {
        el.table.tableRows?.forEach((row, r) => {
          row.tableCells?.forEach((cell, c) => {
            walk(cell.content, `${location}table>r${r}c${c}`)
          })
        })
      } else if (el.tableOfContents) {
        walk(el.tableOfContents.content, location)
      }
    }
  }

  walk(doc.body?.content, '')
  return out
}
