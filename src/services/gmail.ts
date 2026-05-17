// Gmail HTTP helpers. The access token is minted by the Worker's token broker
// (lib/gmailToken → lib/gmailSync.getGmailContext), so we never deal with
// Google OAuth directly here.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Gmail per-user quota is 250 units/sec; messages.get = 5 units. So in theory
// ~50 calls/sec is safe — but the limiter is a token bucket and bursts trip
// 429 well before that. 3 parallel keeps steady-state at ~30/sec ≈ 150 units/sec.
const GMAIL_CONCURRENCY = 3
const GMAIL_MAX_RETRIES = 5

export interface GmailMessage {
  id: string
  subject: string
  from: string
  date: string
  body: string
  snippet: string
}

async function gmailFetch(token: string, path: string): Promise<unknown> {
  let attempt = 0
  while (true) {
    const res = await fetch(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return res.json()
    // Capture Google's structured error so we can tell user-rate-limit (recoverable)
    // from daily-quota or invalid-token (not recoverable by waiting).
    const bodyText = await res.text().catch(() => '')
    let reason = ''
    try {
      const parsed = JSON.parse(bodyText) as { error?: { errors?: Array<{ reason?: string }>; message?: string } }
      reason = parsed.error?.errors?.[0]?.reason ?? parsed.error?.message ?? ''
    } catch { /* non-JSON body */ }

    const fatal429 = res.status === 429 && /dailyLimitExceeded|quotaExceeded(?!.*user)/i.test(reason)
    const retriable = !fatal429 && (res.status === 429 || (res.status >= 500 && res.status < 600))
    if (retriable && attempt < GMAIL_MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(16000, 1000 * 2 ** attempt) + Math.random() * 500
      await new Promise(r => setTimeout(r, waitMs))
      attempt++
      continue
    }
    const detail = reason ? ` (${reason})` : ''
    throw new Error(`Gmail API error: ${res.status}${detail}`)
  }
}

// Run `fn` over `items` with at most `limit` in flight at any time. Preserves
// input order in the returned array. Used to keep Gmail per-user quota happy.
async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
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
    'from:arkia.com', 'from:skyexpress.com', 'from:skyexpress.gr',
    // GDS/agent intermediaries (Amadeus, Sabre, aerocrs etc. forward most e-tickets)
    'from:doc.mail.amadeus.com', 'from:amadeus.com', 'from:aerocrs.com',
    'from:sabre.com', 'from:travelport.com',
    // Accommodations — chains + aggregators
    'from:booking.com', 'from:airbnb.com', 'from:hotels.com', 'from:expedia.com',
    'from:agoda.com', 'from:trivago.com', 'from:vrbo.com', 'from:tripadvisor.com',
    'from:marriott.com', 'from:hilton.com', 'from:ihg.com', 'from:accor.com',
    'from:hyatt.com', 'from:radisson.com', 'from:bestwestern.com', 'from:nh-hotels.com',
    'from:reserve-online.net',
    // Accommodations — Dutch / European small chains Ben uses
    'from:guesthousehotels.nl', 'from:libemafunfactory.nl', 'from:beeksebergen.nl',
    'from:efteling.com',
    // Accommodations — Greek hotel chains Ben uses
    'from:aquilahotels.com', 'from:lyttosbeach.gr',
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
    '(subject:(confirmation OR booking OR reservation OR itinerary OR ticket OR ' +
    'e-ticket OR eticket OR voucher OR PNR OR אישור OR הזמנה OR שובר OR "מסמכי נסיעה") ' +
    'AND subject:(hotel OR flight OR car OR rental OR stay OR check-in OR resort OR ' +
    'airline OR airways OR airport OR ' +
    'מלון OR טיסה OR רכב OR לינה OR דירה OR נסיעה))'

  const baseQuery = `((${senders}) OR ${subjectFallback})`
  // Incremental: prefer `after:<epoch>` (precise) over the broad `newer_than:2y`.
  // Gmail's `after:` is INCLUSIVE — overlap is harmless because we dedupe by
  // confirmation number downstream.
  const timeFilter = opts.sinceEpochSec ? `after:${opts.sinceEpochSec}` : 'newer_than:2y'
  const query = `${baseQuery} ${timeFilter}`
  const max = opts.maxResults ?? 100
  const listRes = await gmailFetch(token, `/messages?q=${encodeURIComponent(query)}&maxResults=${max}`) as { messages?: Array<{ id: string }> }
  const ids = listRes.messages ?? []

  return mapWithConcurrency(ids, GMAIL_CONCURRENCY, async ({ id }) => {
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
}
