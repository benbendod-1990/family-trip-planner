import Anthropic from '@anthropic-ai/sdk'
import { corsHeaders } from './cors'
import { authenticate } from './auth'
import { runDealsScan, type DealsRequest } from './deals'
import { runBlogDigest, type BlogDigestRequest } from './blog'
import { runMapInsights, type MapInsightsRequest } from './map'
import { runItineraryParse, type ItineraryParseRequest } from './itinerary'

export interface Env {
  ANTHROPIC_API_KEY: string
  SUPABASE_JWT_SECRET?: string
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

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'server_misconfigured', detail: 'ANTHROPIC_API_KEY not set' }, 500, cors)
    }
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

    try {
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
