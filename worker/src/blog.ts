import Anthropic from '@anthropic-ai/sdk'
import { BLOG_SYSTEM_PROMPT } from './prompts'

export interface BlogDigestRequest {
  destination: string
  startDate: string
  endDate: string
  passengers: { adults: number; children: number; childAges?: number[] }
  interests?: string[] // e.g., ["safari", "theme parks", "nature"]
}

const BLOG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'must_visit', 'avoid', 'kids_tips', 'seasonal_warnings', 'budget_notes', 'sources'],
  properties: {
    summary: { type: 'string', description: 'Hebrew 3–5 sentence top-line.' },
    must_visit: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'source_url'],
        properties: {
          name: { type: 'string' },
          why: { type: 'string', description: 'Hebrew.' },
          source_url: { type: 'string' },
          single_source: { type: 'boolean' },
          kid_friendly: { type: 'boolean' },
        },
      },
    },
    avoid: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why', 'source_url'],
        properties: {
          name: { type: 'string' },
          why: { type: 'string' },
          source_url: { type: 'string' },
        },
      },
    },
    kids_tips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tip', 'source_url'],
        properties: {
          tip: { type: 'string', description: 'Hebrew.' },
          source_url: { type: 'string' },
        },
      },
    },
    seasonal_warnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['warning', 'source_url'],
        properties: {
          warning: { type: 'string', description: 'Hebrew. Closures, weather, events during the trip window.' },
          source_url: { type: 'string' },
        },
      },
    },
    budget_notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['note', 'source_url'],
        properties: {
          note: { type: 'string', description: 'Hebrew.' },
          source_url: { type: 'string' },
        },
      },
    },
    sources: {
      type: 'array',
      description: 'All URLs consulted for this digest.',
      items: { type: 'string' },
    },
  },
} as const

export async function runBlogDigest(client: Anthropic, req: BlogDigestRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req)

  // Cost guardrail: medium effort + 8K cap. The blog digest needs more
  // headroom than deals (it has more sub-fields to fill), but kept conservative.
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: BLOG_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      { type: 'web_search_20260209', name: 'web_search' },
      { type: 'web_fetch_20260209', name: 'web_fetch' },
    ],
    output_config: {
      format: { type: 'json_schema', schema: BLOG_SCHEMA as unknown as Record<string, unknown> },
      effort: 'medium',
    },
    messages: [{ role: 'user', content: userMsg }],
  })

  return extractJson(response)
}

function buildUserMessage(req: BlogDigestRequest): string {
  const lines: string[] = [
    `Destination: ${req.destination}`,
    `Dates: ${req.startDate} → ${req.endDate}`,
    `Family: ${req.passengers.adults} adults, ${req.passengers.children} children${
      req.passengers.childAges?.length ? ` (ages ${req.passengers.childAges.join(', ')})` : ''
    }`,
  ]
  if (req.interests?.length) {
    lines.push(`Stated interests: ${req.interests.join(', ')}`)
  }
  lines.push('')
  lines.push('Research blog posts, parent forums, and family guides. Return the digest in the enforced schema.')
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
