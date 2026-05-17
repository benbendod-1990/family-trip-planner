import Anthropic from '@anthropic-ai/sdk'
import { corsHeaders } from './cors'
import { authenticate } from './auth'
import { runDealsScan, type DealsRequest } from './deals'
import { runBlogDigest, type BlogDigestRequest } from './blog'
import { runMapInsights, type MapInsightsRequest } from './map'
import { runItineraryParse, type ItineraryParseRequest } from './itinerary'
import { runDealsScanGemini } from './dealsGemini'
import { runBlogDigestGemini } from './blogGemini'
import { runItineraryParseGemini } from './itineraryGemini'
import { runParseDocument, type ParseDocumentRequest } from './parseDocument'
import { storeRefreshToken, getAccessToken } from './gmail'

export interface Env {
  ANTHROPIC_API_KEY: string
  GEMINI_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_JWT_SECRET?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  SHARED_API_SECRET?: string
  ALLOWED_ORIGIN: string
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin')
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return json({ ok: true }, 200, cors)
    }

    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors)
    }

    const caller = await authenticate(req, env)
    if (!caller) return json({ error: 'unauthorized' }, 401, cors)

    try {
      // Gmail token broker. Requires a real user (not the shared-secret path).
      if (url.pathname.startsWith('/api/gmail/')) {
        if (caller.kind !== 'supabase-user' || !caller.userId) {
          return json({ error: 'unauthorized', detail: 'user session required' }, 401, cors)
        }
        if (url.pathname === '/api/gmail/store-refresh-token') {
          const body = (await req.json()) as { refresh_token?: unknown; scope?: unknown }
          const r = await storeRefreshToken(env, caller.userId, body)
          if ('error' in r) return json({ error: r.error, detail: r.detail }, r.status, cors)
          return json(r, 200, cors)
        }
        if (url.pathname === '/api/gmail/access-token') {
          const r = await getAccessToken(env, caller.userId)
          if ('error' in r) return json({ error: r.error, detail: r.detail }, r.status, cors)
          return json(r, 200, cors)
        }
      }

      // Gemini-backed routes (free tier — preferred per project's "100% free" rule).
      // These don't need the Anthropic client, so handle them before that check.
      if (url.pathname.startsWith('/api/gemini/')) {
        if (!env.GEMINI_API_KEY) {
          return json({ error: 'server_misconfigured', detail: 'GEMINI_API_KEY not set' }, 500, cors)
        }
        if (url.pathname === '/api/gemini/deals') {
          const body = (await req.json()) as DealsRequest
          const result = await runDealsScanGemini(env.GEMINI_API_KEY, body)
          return json(result, 200, cors)
        }
        if (url.pathname === '/api/gemini/blog') {
          const body = (await req.json()) as BlogDigestRequest
          const result = await runBlogDigestGemini(env.GEMINI_API_KEY, body)
          return json(result, 200, cors)
        }
        if (url.pathname === '/api/gemini/parse-document') {
          const body = (await req.json()) as ParseDocumentRequest
          if (!body?.text || typeof body.text !== 'string') {
            return json({ error: 'bad_request', detail: 'body.text (string) required' }, 400, cors)
          }
          const result = await runParseDocument(env.GEMINI_API_KEY, body)
          return json(result, 200, cors)
        }
        if (url.pathname === '/api/gemini/itinerary/parse') {
          const body = (await req.json()) as ItineraryParseRequest
          if (!body?.text || typeof body.text !== 'string') {
            return json({ error: 'bad_request', detail: 'body.text (string) required' }, 400, cors)
          }
          const result = await runItineraryParseGemini(env.GEMINI_API_KEY, body)
          return json(result, 200, cors)
        }
      }

      if (!env.ANTHROPIC_API_KEY) {
        return json({ error: 'server_misconfigured', detail: 'ANTHROPIC_API_KEY not set' }, 500, cors)
      }
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

      if (url.pathname === '/api/deals/scan') {
        const body = (await req.json()) as DealsRequest
        const result = await runDealsScan(client, body)
        return json(result, 200, cors)
      }

      if (url.pathname === '/api/blog/digest') {
        const body = (await req.json()) as BlogDigestRequest
        const result = await runBlogDigest(client, body)
        return json(result, 200, cors)
      }

      if (url.pathname === '/api/map/insights') {
        const body = (await req.json()) as MapInsightsRequest
        const result = await runMapInsights(client, body)
        return json(result, 200, cors)
      }

      if (url.pathname === '/api/itinerary/parse') {
        const body = (await req.json()) as ItineraryParseRequest
        const result = await runItineraryParse(client, body)
        return json(result, 200, cors)
      }

      return json({ error: 'not_found' }, 404, cors)
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        return json({ error: 'upstream_error', status: e.status, detail: e.message }, 502, cors)
      }
      const msg = e instanceof Error ? e.message : String(e)
      return json({ error: 'internal_error', detail: msg }, 500, cors)
    }
  },
}

function json(body: unknown, status: number, cors: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
