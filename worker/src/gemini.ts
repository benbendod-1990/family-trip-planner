// Minimal Gemini REST wrapper for Cloudflare Workers (no SDK — just fetch).
// Free tier: gemini-2.5-flash, 1500 req/day.
//
// Notes on Gemini 2.5:
//  - Thinking is ON by default and consumes output tokens. Pass thinkingBudget=0
//    to disable it for short structured tasks; pass 1024+ for tasks that benefit
//    from reasoning (e.g., multi-source price comparison).
//  - googleSearch grounding is mutually exclusive with strict responseSchema in
//    the same call. We rely on strong prompting + responseMimeType="application/json"
//    when grounding is enabled, and parse JSON from the text response.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiCallOptions {
  apiKey: string
  model?: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.5-flash-lite'
  systemPrompt: string
  userMessage: string
  thinkingBudget?: number     // 0 disables thinking; default 0
  enableSearch?: boolean      // adds googleSearch tool for grounded answers
  maxOutputTokens?: number    // default 4096
  temperature?: number        // default 0.4
}

export interface GeminiCallResult {
  text: string
  json: unknown               // parsed JSON if model returned valid JSON, else null
  groundingSources: string[]  // URLs the model cited via search grounding
  usage: {
    promptTokens?: number
    candidateTokens?: number
    totalTokens?: number
  }
}

export async function callGemini(opts: GeminiCallOptions): Promise<GeminiCallResult> {
  const model = opts.model ?? 'gemini-2.5-flash'
  const url = `${ENDPOINT}/${model}:generateContent?key=${opts.apiKey}`

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: opts.userMessage }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
    },
  }

  if (opts.enableSearch) {
    body.tools = [{ google_search: {} }]
    // responseMimeType + grounding is rejected — fall back to plain text + manual JSON parse
    delete (body.generationConfig as Record<string, unknown>).responseMimeType
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 500)}`)
  }

  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.map(p => p.text ?? '').join('') ?? ''

  return {
    text,
    json: extractJson(text),
    groundingSources: extractGroundingSources(candidate),
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount,
      candidateTokens: data.usageMetadata?.candidatesTokenCount,
      totalTokens: data.usageMetadata?.totalTokenCount,
    },
  }
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
  groundingMetadata?: {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
  }
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

function extractJson(text: string): unknown {
  if (!text) return null
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // Strip markdown fences ```json ... ``` and try again
    const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
    if (fenced) {
      try { return JSON.parse(fenced[1]) } catch { /* fall through */ }
    }
    // Last resort: find the largest balanced {...} block
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)) } catch { /* give up */ }
    }
  }
  return null
}

function extractGroundingSources(candidate: GeminiCandidate | undefined): string[] {
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? []
  const urls: string[] = []
  for (const c of chunks) {
    if (c.web?.uri) urls.push(c.web.uri)
  }
  return urls
}
