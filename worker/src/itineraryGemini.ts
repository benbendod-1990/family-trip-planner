// Free-text → calendar events parser using Gemini 2.5 Flash (free tier).
// Same input/output contract as itinerary.ts (Claude variant) so the frontend
// can swap by changing the URL path only.

import { callGemini } from './gemini'
import { ITINERARY_PARSE_SYSTEM_PROMPT } from './prompts'
import type { ItineraryParseRequest } from './itinerary'

export type { ItineraryParseRequest } from './itinerary'

const SCHEMA_DESCRIPTION = `Return a single JSON object with this exact shape:
{
  "events": Array<{
    "title":       string,                 // Hebrew, short ("ביקור באנה פרנק האוס")
    "date":        string,                 // YYYY-MM-DD inside the trip window
    "startTime":   string,                 // HH:MM 24h
    "endTime":     string,                 // HH:MM 24h, optional
    "category":    "activity" | "meal" | "transport" | "rest" | "tour",
    "location":    string,                 // address or place name suitable for OSM geocoding
    "description": string,                 // optional Hebrew note
    "cost":        number,                 // optional
    "confidence":  number                  // 0-1
  }>,
  "notes": string                          // optional Hebrew note about ambiguity ("פירשתי 'מחר' כיום ה-3.5"); empty string if none
}
Output JSON only — no prose, no markdown fences.`

const MAX_INPUT_CHARS = 30_000

export async function runItineraryParseGemini(apiKey: string, req: ItineraryParseRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req) + '\n\n' + SCHEMA_DESCRIPTION

  const result = await callGemini({
    apiKey,
    model: 'gemini-2.5-flash',
    systemPrompt: ITINERARY_PARSE_SYSTEM_PROMPT,
    userMessage: userMsg,
    enableSearch: false,
    thinkingBudget: 512,
    maxOutputTokens: 8000,
    temperature: 0.2,
  })

  if (!result.json) {
    throw new Error(`Gemini returned no parseable JSON. First 300 chars: ${result.text.slice(0, 300)}`)
  }

  const out = result.json as Record<string, unknown>
  return { ...out, _meta: { provider: 'gemini-2.5-flash', usage: result.usage } }
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
  const text = req.text.length > MAX_INPUT_CHARS
    ? req.text.slice(0, MAX_INPUT_CHARS) + '\n[…truncated]'
    : req.text
  lines.push(text)
  lines.push('')
  lines.push(
    'Parse into one or more events that fall inside the trip window. Resolve relative dates ("מחר", "ביום שני", "יום אחרון") relative to "Today". If a date is impossible (outside the window), clamp to the nearest day inside the window and note it. Default duration: meal=60min, activity=90min, tour=180min. If start time is missing, infer from context (e.g. "ארוחת ערב"=19:00).'
  )
  return lines.join('\n')
}
