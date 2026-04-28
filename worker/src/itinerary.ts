import Anthropic from '@anthropic-ai/sdk'
import { ITINERARY_PARSE_SYSTEM_PROMPT } from './prompts'

export interface ItineraryParseRequest {
  text: string
  destination: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  today: string // YYYY-MM-DD — caller-supplied so AI resolves "tomorrow" correctly in user's timezone
  // Optional hint: if the user already pinned a location (e.g. clicked on the map), pass it
  // so AI doesn't second-guess the address.
  pinnedLocation?: { name?: string; address?: string }
}

const ITINERARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      description: 'One or more events parsed from the free text. If the user gave one short instruction, return a single event.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'date', 'startTime', 'category'],
        properties: {
          title: { type: 'string', description: 'Short Hebrew title for the event.' },
          date: { type: 'string', description: 'YYYY-MM-DD inside the trip window.' },
          startTime: { type: 'string', description: 'HH:MM 24h.' },
          endTime: { type: 'string', description: 'HH:MM 24h, optional.' },
          category: {
            type: 'string',
            enum: ['activity', 'meal', 'transport', 'rest', 'tour'],
          },
          location: {
            type: 'string',
            description: 'Best human-readable address or place name suitable for geocoding (English/local language preferred).',
          },
          description: { type: 'string', description: 'Optional short Hebrew note.' },
          cost: { type: 'number', description: 'Optional cost if the user mentioned one.' },
          confidence: {
            type: 'number',
            description: '0-1 confidence the parse matches user intent. Lower if date/time was ambiguous.',
          },
        },
      },
    },
    notes: {
      type: 'string',
      description: 'Optional Hebrew note to the user about ambiguity (e.g., "פירשתי \'מחר\' כיום ה-28.4"). Empty string if none.',
    },
  },
} as const

export async function runItineraryParse(client: Anthropic, req: ItineraryParseRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: ITINERARY_PARSE_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: ITINERARY_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{ role: 'user', content: userMsg }],
  })

  return extractJson(response)
}

function buildUserMessage(req: ItineraryParseRequest): string {
  const lines: string[] = [
    `Destination: ${req.destination}`,
    `Trip window: ${req.startDate} → ${req.endDate}`,
    `Today is: ${req.today}`,
  ]
  if (req.pinnedLocation) {
    lines.push(
      `Pinned location (use this verbatim, do NOT change): ${req.pinnedLocation.name ?? ''}${
        req.pinnedLocation.address ? ' — ' + req.pinnedLocation.address : ''
      }`
    )
  }
  lines.push('')
  lines.push('User instruction (Hebrew or mixed):')
  lines.push(req.text)
  lines.push('')
  lines.push(
    'Parse into one or more events that fall inside the trip window. Resolve relative dates ("מחר", "ביום שני", "יום אחרון") relative to "Today". If a date is impossible (outside the window), clamp to the nearest day inside the window and note it. Default duration: meal=60min, activity=90min, tour=180min. If start time is missing, infer from context (e.g. "ארוחת ערב"=19:00). Honor the schema.'
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
