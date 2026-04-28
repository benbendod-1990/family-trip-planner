import Anthropic from '@anthropic-ai/sdk'
import { DEALS_SYSTEM_PROMPT } from './prompts'

export interface DealsRequest {
  destination: string
  startDate: string
  endDate: string
  origin: string            // e.g., "TLV"
  destinationAirport: string // e.g., "AMS"
  current: {
    flight?: { airline: string; price?: number; currency?: string; bookingRef?: string }
    hotel?: { name: string; price: number; currency: string }[]
  }
  passengers: { adults: number; children: number }
}

const DEALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'alerts', 'findings', 'scanned_sources'],
  properties: {
    summary: { type: 'string', description: 'Hebrew 1–3 sentence summary for the user.' },
    alerts: {
      type: 'array',
      description: 'Urgent items the user should act on within 48h (Hebrew).',
      items: { type: 'string' },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'provider', 'price', 'currency', 'url', 'beats_existing_by_pct'],
        properties: {
          type: { type: 'string', enum: ['flight', 'hotel', 'package'] },
          provider: { type: 'string' },
          price: { type: 'number' },
          currency: { type: 'string' },
          url: { type: 'string' },
          dates: { type: 'string', description: 'ISO date range e.g., 2026-08-20/2026-08-27' },
          beats_existing_by_pct: { type: 'number', description: 'Negative if worse, positive if better.' },
          notes: { type: 'string' },
        },
      },
    },
    scanned_sources: {
      type: 'array',
      description: 'URLs actually consulted.',
      items: { type: 'string' },
    },
  },
} as const

export async function runDealsScan(client: Anthropic, req: DealsRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req)

  // Cost guardrail: medium effort + 4K cap keeps each scan well under $0.30
  // on Opus 4.7 even with web_search/fetch traffic. Bump effort/max_tokens
  // explicitly when the user asks for a deeper sweep.
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: DEALS_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      { type: 'web_search_20260209', name: 'web_search' },
      { type: 'web_fetch_20260209', name: 'web_fetch' },
    ],
    output_config: {
      format: { type: 'json_schema', schema: DEALS_SCHEMA as unknown as Record<string, unknown> },
      effort: 'medium',
    },
    messages: [{ role: 'user', content: userMsg }],
  })

  return extractJson(response)
}

function buildUserMessage(req: DealsRequest): string {
  const lines: string[] = [
    `Trip: ${req.destination}, ${req.startDate} → ${req.endDate}`,
    `Route: ${req.origin} → ${req.destinationAirport} (return ${req.destinationAirport} → ${req.origin})`,
    `Passengers: ${req.passengers.adults} adults + ${req.passengers.children} children`,
    '',
    'CURRENT BOOKINGS (beat these or say nothing better is available):',
  ]
  if (req.current.flight) {
    const f = req.current.flight
    lines.push(
      `  - Flight: ${f.airline}${f.price ? ` at ${f.price} ${f.currency ?? 'EUR'}` : ' (price unknown)'}${
        f.bookingRef ? ` (ref ${f.bookingRef})` : ''
      }`
    )
  } else {
    lines.push('  - Flight: NONE — find the cheapest family-fare option.')
  }
  if (req.current.hotel?.length) {
    for (const h of req.current.hotel) {
      lines.push(`  - Hotel: ${h.name} at ${h.price} ${h.currency}`)
    }
  } else {
    lines.push('  - Hotel: NONE')
  }
  lines.push('')
  lines.push('Scan, compare, and return findings in the enforced schema.')
  return lines.join('\n')
}

function extractJson(response: Anthropic.Message): unknown {
  for (const block of response.content) {
    if (block.type === 'text') {
      try {
        return JSON.parse(block.text)
      } catch {
        // Fall through to next block
      }
    }
  }
  throw new Error('Model returned no parseable JSON block')
}
