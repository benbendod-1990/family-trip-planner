import Anthropic from '@anthropic-ai/sdk'
import { MAP_SYSTEM_PROMPT } from './prompts'

export interface MapInsightsRequest {
  destination: string
  startDate: string
  endDate: string
  passengers: { adults: number; children: number; childAges?: number[] }
  points: Array<{
    id: string
    kind: 'destination' | 'accommodation' | 'event'
    name: string
    address?: string
    date?: string
    startTime?: string
    category?: string
  }>
}

const MAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['per_point', 'connections', 'sources'],
  properties: {
    per_point: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'tips', 'nearby'],
        properties: {
          id: { type: 'string' },
          tips: {
            type: 'array',
            description: 'Hebrew. 1–3 quick practical tips for THIS specific point (best time, parking, queue trick, kid hack).',
            items: { type: 'string' },
          },
          nearby: {
            type: 'array',
            description: 'Up to 3 worthwhile spots within ~15 min walk/drive that fit the family + the timing of this point.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'why', 'walking_minutes', 'kid_friendly', 'source_url'],
              properties: {
                name: { type: 'string' },
                why: { type: 'string', description: 'Hebrew. One short sentence.' },
                walking_minutes: { type: 'number' },
                kid_friendly: { type: 'boolean' },
                source_url: { type: 'string' },
              },
            },
          },
        },
      },
    },
    connections: {
      type: 'array',
      description: 'Smart suggestions for things to do BETWEEN consecutive points on the same day (en-route stops).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from_id', 'to_id', 'suggestion', 'source_url'],
        properties: {
          from_id: { type: 'string' },
          to_id: { type: 'string' },
          suggestion: { type: 'string', description: 'Hebrew. One sentence: what to stop for and why.' },
          source_url: { type: 'string' },
        },
      },
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

export async function runMapInsights(client: Anthropic, req: MapInsightsRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req)

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: MAP_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      { type: 'web_search_20260209', name: 'web_search' },
      { type: 'web_fetch_20260209', name: 'web_fetch' },
    ],
    output_config: {
      format: { type: 'json_schema', schema: MAP_SCHEMA as unknown as Record<string, unknown> },
      effort: 'medium',
    },
    messages: [{ role: 'user', content: userMsg }],
  })

  return extractJson(response)
}

function buildUserMessage(req: MapInsightsRequest): string {
  const lines: string[] = [
    `Destination: ${req.destination}`,
    `Dates: ${req.startDate} → ${req.endDate}`,
    `Family: ${req.passengers.adults} adults, ${req.passengers.children} children${
      req.passengers.childAges?.length ? ` (ages ${req.passengers.childAges.join(', ')})` : ''
    }`,
    '',
    'Trip points (one per line — id | kind | date | name | address):',
  ]
  for (const p of req.points) {
    lines.push(
      `  ${p.id} | ${p.kind} | ${p.date ?? '-'}${p.startTime ? ' ' + p.startTime : ''} | ${p.name} | ${p.address ?? '-'}`
    )
  }
  lines.push('')
  lines.push(
    'For each point, return tips + up to 3 nearby family-friendly spots. ' +
      'Then suggest en-route stops between consecutive same-day points (use the connections array). ' +
      'Honor the JSON schema. Hebrew for human text, English for names/URLs.'
  )
  return lines.join('\n')
}

function extractJson(response: Anthropic.Message): unknown {
  for (const block of response.content) {
    if (block.type === 'text') {
      try {
        return JSON.parse(block.text)
      } catch {
        // next block
      }
    }
  }
  throw new Error('Model returned no parseable JSON block')
}
