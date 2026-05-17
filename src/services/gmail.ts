// Gmail HTTP helpers. The access token comes from the Supabase Google OAuth
// session (see lib/gmailSync.ts → getGmailContext), so there's no separate
// Google client ID configured here — Supabase provider handles OAuth.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface GmailMessage {
  id: string
  subject: string
  from: string
  date: string
  body: string
  snippet: string
}

async function gmailFetch(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
  return res.json()
}

function decodeBase64(encoded: string): string {
  const fixed = encoded.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(escape(atob(fixed)))
  } catch {
    return atob(fixed)
  }
}

function extractBody(payload: Record<string, unknown>): string {
  const parts = payload.parts as Array<Record<string, unknown>> | undefined
  const body = payload.body as Record<string, unknown> | undefined

  if (body?.data) return decodeBase64(body.data as string)
  if (parts) {
    for (const part of parts) {
      const mimeType = part.mimeType as string
      const partBody = part.body as Record<string, unknown>
      if ((mimeType === 'text/plain' || mimeType === 'text/html') && partBody?.data) {
        return decodeBase64(partBody.data as string)
      }
      const sub = extractBody(part)
      if (sub) return sub
    }
  }
  return ''
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export interface FetchTravelEmailsOptions {
  // If set, only fetch messages received AFTER this Unix epoch (seconds).
  // Falls back to "newer_than:2y" when undefined — used for the very first sync.
  sinceEpochSec?: number
  maxResults?: number
}

export async function fetchTravelEmails(token: string, opts: FetchTravelEmailsOptions = {}): Promise<GmailMessage[]> {
  // Two-pronged query: explicit airline/hotel/car senders OR generic
  // booking-confirmation subjects. The generic prong catches small-chain hotels
  // (e.g. guesthousehotels.nl, libemafunfactory.nl) that no allowlist will cover.
  const senders = [
    // Airlines
    'from:elal-ticketing.com', 'from:elal.co.il', 'from:israir.co.il',
    'from:ryanair.com', 'from:easyjet.com', 'from:wizzair.com', 'from:lufthansa.com',
    'from:aegeanair.com', 'from:klm.com', 'from:airfrance.com', 'from:aerlingus.com',
    'from:swiss.com', 'from:austrian.com', 'from:tap.com', 'from:vueling.com',
    'from:flydubai.com', 'from:turkishairlines.com', 'from:bluebirdairways.com',
    'from:arkia.com',
    // Accommodations — chains + aggregators
    'from:booking.com', 'from:airbnb.com', 'from:hotels.com', 'from:expedia.com',
    'from:agoda.com', 'from:trivago.com', 'from:vrbo.com', 'from:tripadvisor.com',
    'from:marriott.com', 'from:hilton.com', 'from:ihg.com', 'from:accor.com',
    'from:hyatt.com', 'from:radisson.com', 'from:bestwestern.com', 'from:nh-hotels.com',
    // Accommodations — Dutch / European small chains Ben uses
    'from:guesthousehotels.nl', 'from:libemafunfactory.nl', 'from:beeksebergen.nl',
    'from:efteling.com',
    // Activities
    'from:getyourguide.com', 'from:viator.com', 'from:arbitrip.com', 'from:klook.com',
    'from:tiqets.com',
    // Car rentals — international
    'from:hertz.com', 'from:avis.com', 'from:budget.com', 'from:europcar.com',
    'from:sixt.com', 'from:alamo.com', 'from:enterprise.com', 'from:nationalcar.com',
    'from:dollar.com', 'from:thrifty.com', 'from:rentalcars.com', 'from:autoeurope.com',
    'from:discovercars.com', 'from:sunnycars.com',
    // Car rentals — Israel
    'from:eldan.co.il', 'from:shlomo.co.il', 'from:hertz.co.il',
    'from:avis.co.il', 'from:budget.co.il', 'from:europcar.co.il',
  ].join(' OR ')

  // Generic confirmation subjects — catches anything we don't have on the allowlist.
  // Restrictive enough to avoid newsletters: requires a confirmation-style word AND
  // a travel/booking word in the subject.
  const subjectFallback =
    '(subject:(confirmation OR booking OR reservation OR itinerary OR ticket OR אישור OR הזמנה) ' +
    'AND subject:(hotel OR flight OR car OR rental OR stay OR check-in OR resort OR ' +
    'מלון OR טיסה OR רכב OR לינה OR דירה))'

  const baseQuery = `((${senders}) OR ${subjectFallback})`
  // Incremental: prefer `after:<epoch>` (precise) over the broad `newer_than:2y`.
  // Gmail's `after:` is INCLUSIVE — overlap is harmless because we dedupe by
  // confirmation number downstream.
  const timeFilter = opts.sinceEpochSec ? `after:${opts.sinceEpochSec}` : 'newer_than:2y'
  const query = `${baseQuery} ${timeFilter}`
  const max = opts.maxResults ?? 100
  const listRes = await gmailFetch(token, `/messages?q=${encodeURIComponent(query)}&maxResults=${max}`) as { messages?: Array<{ id: string }> }
  const ids = listRes.messages ?? []

  const messages = await Promise.all(
    ids.map(async ({ id }) => {
      const msg = await gmailFetch(token, `/messages/${id}?format=full`) as Record<string, unknown>
      const payload = msg.payload as Record<string, unknown>
      const headers = payload.headers as Array<{ name: string; value: string }>
      return {
        id,
        subject: getHeader(headers, 'Subject'),
        from: getHeader(headers, 'From'),
        date: getHeader(headers, 'Date'),
        snippet: (msg.snippet as string) ?? '',
        body: extractBody(payload),
      }
    })
  )

  return messages
}
