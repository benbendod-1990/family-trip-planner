// Generic document parser using Gemini.
// Input: arbitrary travel-related text (email body, PDF text, OCR'd image text).
// Output: structured bookings (flights, accommodations, car rentals, events) that
// match the frontend Trip schema 1:1.
//
// Used by:
//   1. Gmail-sync AI fallback — when the regex parser returns 'unknown' or
//      core fields are blank, the email body is sent here.
//   2. Manual import — user drag-drops a PDF/email/text → frontend extracts
//      text → posts here.

import { callGemini } from './gemini'

export interface ParseDocumentRequest {
  text: string
  // Optional context — helps Gemini resolve relative dates and pick the right
  // currency / language. All optional.
  hint?: {
    today?: string          // YYYY-MM-DD
    tripStart?: string      // YYYY-MM-DD
    tripEnd?: string        // YYYY-MM-DD
    destination?: string
    sourceFilename?: string
  }
}

const SYSTEM_PROMPT = `You extract structured travel bookings from messy text.

Input is the body of an email, the text from a PDF e-ticket, or OCR'd text from
a screenshot. It may include HTML tags, footers, marketing fluff, multiple
languages (English/Greek/Hebrew/Dutch). Ignore the noise — find the real
booking facts.

Rules:
  1. Output JSON only — no prose, no markdown fences.
  2. If the text contains MULTIPLE flight segments (e.g. TLV→ATH→AMS), return
     ALL of them as separate items in the "flights" array — never collapse a
     connecting itinerary into one direct flight.
  3. Times: emit ISO 8601 with timezone if you can infer it from the airport
     (e.g. AMS = Europe/Amsterdam). If not, emit local time without timezone
     (YYYY-MM-DDTHH:mm:ss) and set "timesAreLocal": true at the root.
  4. Currency: use ISO codes (EUR, USD, ILS).
  5. Direction: "outbound" for the first segment chronologically, "return" for
     the rest unless dates clearly indicate otherwise.
  6. If a field genuinely isn't present, omit it — do NOT invent.
  7. NEVER use the booking reference (PNR) as the flight number. If the only
     code you see is the PNR, leave flightNumber empty.
  8. Hotel address: emit the FULL street address if present, not just the city.
  9. Set "confidence" 0-1 per item — lower if you had to guess.`

const SCHEMA_DESCRIPTION = `Return one JSON object:
{
  "documentType": "flight" | "hotel" | "car_rental" | "event" | "mixed" | "unknown",
  "language": "en" | "he" | "el" | "nl" | "other",
  "timesAreLocal": boolean,
  "flights": Array<{
    "airline":             string,
    "flightNumber":        string,        // e.g. "A3 950" — NEVER the PNR
    "departureAirport":    string,        // IATA 3-letter
    "arrivalAirport":      string,
    "departureTime":       string,        // ISO 8601
    "arrivalTime":         string,
    "cost":                number,
    "currency":            string,
    "direction":           "outbound" | "return",
    "cabinClass":          "economy" | "business" | "first",
    "confirmationNumber":  string,
    "baggageIncluded":     boolean,
    "ticketUrl":           string,
    "confidence":          number
  }>,
  "accommodations": Array<{
    "name":               string,
    "type":               "hotel" | "airbnb" | "hostel" | "villa" | "other",
    "address":            string,         // FULL street address, not just city
    "checkIn":            string,         // YYYY-MM-DD
    "checkOut":           string,
    "cost":               number,
    "currency":           string,
    "confirmationNumber": string,
    "notes":              string,
    "confidence":         number
  }>,
  "carRentals": Array<{
    "company":            string,
    "carModel":           string,
    "carCategory":        "economy" | "compact" | "midsize" | "full-size" | "suv" | "van" | "luxury",
    "pickupLocation":     string,
    "dropoffLocation":    string,
    "pickupDate":         string,         // ISO 8601
    "dropoffDate":        string,
    "cost":               number,
    "currency":           string,
    "confirmationNumber": string,
    "driverName":         string,
    "includesInsurance":  boolean,
    "confidence":         number
  }>,
  "events": Array<{
    "title":       string,                // Hebrew preferred for human-facing
    "date":        string,                // YYYY-MM-DD
    "startTime":   string,                // HH:MM
    "endTime":     string,
    "location":    string,
    "category":    "activity" | "meal" | "transport" | "rest" | "tour",
    "cost":        number,
    "currency":    string,
    "confidence":  number
  }>,
  "warnings": string[]                    // Hebrew — things you noticed but couldn't fit
}`

export async function runParseDocument(apiKey: string, req: ParseDocumentRequest): Promise<unknown> {
  const userMsg = buildUserMessage(req) + '\n\n' + SCHEMA_DESCRIPTION

  const result = await callGemini({
    apiKey,
    model: 'gemini-2.5-flash',
    systemPrompt: SYSTEM_PROMPT,
    userMessage: userMsg,
    enableSearch: false,    // pure extraction — no web search needed
    thinkingBudget: 1024,   // helps with multi-segment itineraries
    maxOutputTokens: 6000,
    temperature: 0.1,       // be conservative — extraction, not creativity
  })

  if (!result.json) {
    throw new Error(`Gemini returned no parseable JSON. First 300 chars: ${result.text.slice(0, 300)}`)
  }

  const out = result.json as Record<string, unknown>
  return { ...out, _meta: { provider: 'gemini-2.5-flash', usage: result.usage } }
}

function buildUserMessage(req: ParseDocumentRequest): string {
  const lines: string[] = []
  if (req.hint) {
    if (req.hint.today) lines.push(`Today: ${req.hint.today}`)
    if (req.hint.tripStart && req.hint.tripEnd) {
      lines.push(`Active trip window: ${req.hint.tripStart} → ${req.hint.tripEnd}`)
    }
    if (req.hint.destination) lines.push(`Active trip destination: ${req.hint.destination}`)
    if (req.hint.sourceFilename) lines.push(`Source filename: ${req.hint.sourceFilename}`)
    lines.push('')
  }
  // Cap at 60K chars — enough for any normal email/PDF, well under Gemini's input limit.
  const capped = req.text.length > 60_000 ? req.text.slice(0, 60_000) + '\n[…truncated]' : req.text
  lines.push('--- DOCUMENT TEXT ---')
  lines.push(capped)
  lines.push('--- END DOCUMENT TEXT ---')
  lines.push('')
  lines.push('Extract everything bookable into the JSON shape below.')
  return lines.join('\n')
}
