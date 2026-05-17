// Deals scanner using Gemini 2.5 Flash + Google Search grounding (free tier).
// Same input/output contract as deals.ts (Claude variant) so the frontend can swap.

import { callGemini } from './gemini'
import { DEALS_SYSTEM_PROMPT } from './prompts'
import type { DealsRequest } from './deals'

export type { DealsRequest } from './deals'

const SCHEMA_DESCRIPTION = `Return a single JSON object with these fields exactly:
{
  "summary": string,                     // Hebrew, 1-3 sentences for the user
  "alerts":  string[],                   // Hebrew, urgent items to act on within 48h
  "findings": Array<{
    "type":      "flight" | "hotel" | "package",
    "provider":  string,                 // e.g. "Skyscanner", "Booking"
    "price":     number,
    "currency":  string,                 // ISO code, e.g. "EUR"
    "url":       string,                 // direct bookable URL
    "dates":     string,                 // ISO range "2026-08-20/2026-08-27"
    "beats_existing_by_pct": number,     // positive if cheaper than user's current booking
    "notes":     string                  // optional Hebrew note
  }>,
  "scanned_sources": string[]            // URLs actually consulted via search
}
Output JSON only. No prose, no markdown fences.`

export async function runDealsScanGemini(apiKey: string, req: DealsRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req) + '\n\n' + SCHEMA_DESCRIPTION

  const result = await callGemini({
    apiKey,
    model: 'gemini-2.5-flash',
    systemPrompt: DEALS_SYSTEM_PROMPT,
    userMessage: userMsg,
    enableSearch: true,        // grounding required — Gemini's training cutoff can't price flights
    thinkingBudget: 1024,      // price comparison benefits from short reasoning
    maxOutputTokens: 4096,
    temperature: 0.3,
  })

  if (!result.json) {
    throw new Error(`Gemini returned no parseable JSON. First 300 chars: ${result.text.slice(0, 300)}`)
  }

  // Augment with grounding-cited URLs in case the model under-reported scanned_sources.
  const merged = result.json as { scanned_sources?: unknown }
  const existing = Array.isArray(merged.scanned_sources) ? (merged.scanned_sources as string[]) : []
  merged.scanned_sources = Array.from(new Set([...existing, ...result.groundingSources]))

  return { ...merged, _meta: { provider: 'gemini-2.5-flash', usage: result.usage } }
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
  lines.push('Scan, compare, and return findings in the JSON shape described below.')
  return lines.join('\n')
}
