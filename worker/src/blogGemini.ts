// Blog/route digest using Gemini 2.5 Flash + Google Search grounding (free tier).
// Same input/output contract as blog.ts (Claude variant) so the frontend can swap.

import { callGemini } from './gemini'
import { BLOG_SYSTEM_PROMPT } from './prompts'
import type { BlogDigestRequest } from './blog'

export type { BlogDigestRequest } from './blog'

const SCHEMA_DESCRIPTION = `Return a single JSON object with these fields exactly:
{
  "summary": string,                         // Hebrew, 3-5 sentence top-line
  "must_visit": Array<{
    "name":         string,                  // English/local place name
    "why":          string,                  // Hebrew
    "source_url":   string,
    "kid_friendly": boolean,
    "single_source": boolean                 // true if only one source mentions it
  }>,
  "avoid": Array<{ "name": string, "why": string, "source_url": string }>,
  "kids_tips": Array<{ "tip": string, "source_url": string }>,                    // tip in Hebrew
  "seasonal_warnings": Array<{ "warning": string, "source_url": string }>,        // warning in Hebrew
  "budget_notes": Array<{ "note": string, "source_url": string }>,                // note in Hebrew
  "sources": string[]                        // all consulted URLs
}
Output JSON only. No prose, no markdown fences.`

export async function runBlogDigestGemini(apiKey: string, req: BlogDigestRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req) + '\n\n' + SCHEMA_DESCRIPTION

  const result = await callGemini({
    apiKey,
    model: 'gemini-2.5-flash',
    systemPrompt: BLOG_SYSTEM_PROMPT,
    userMessage: userMsg,
    enableSearch: true,        // synthesizes recent blog posts → must search the live web
    thinkingBudget: 2048,      // larger budget — synthesis across multiple sources
    maxOutputTokens: 8192,
    temperature: 0.5,
  })

  if (!result.json) {
    throw new Error(`Gemini returned no parseable JSON. First 300 chars: ${result.text.slice(0, 300)}`)
  }

  const merged = result.json as { sources?: unknown }
  const existing = Array.isArray(merged.sources) ? (merged.sources as string[]) : []
  merged.sources = Array.from(new Set([...existing, ...result.groundingSources]))

  return { ...merged, _meta: { provider: 'gemini-2.5-flash', usage: result.usage } }
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
  lines.push('Research blog posts, parent forums, and family guides published in the last 24 months. Prefer recent posts. Return the digest in the JSON shape described below.')
  return lines.join('\n')
}
