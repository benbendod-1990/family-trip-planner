import type { GmailMessage } from './gmail'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'
import type { TripEvent } from '@/types/trip'

export type ParsedEmailType = 'flight' | 'accommodation' | 'car-rental' | 'event' | 'unknown'

export interface ParsedEmail {
  messageId: string
  type: ParsedEmailType
  subject: string
  from: string
  date: string
  flight?: Omit<Flight, 'id'>
  accommodation?: Omit<Accommodation, 'id'>
  carRental?: Omit<CarRental, 'id'>
  event?: Omit<TripEvent, 'id' | 'dayId'>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function text(msg: GmailMessage): string {
  return `${msg.subject} ${msg.snippet} ${msg.body}`.replace(/<[^>]*>/g, ' ')
}

const TICKET_URL_KEYWORDS = /manage|booking|ticket|reservation|pnr|check.?in|eticket|e-ticket|my.?trip|itinerary|boarding/i
const JUNK_URL_RE = /unsubscribe|tracking|track\.|\/track\/|click\.|gstatic|googleusercontent|facebook|twitter|instagram|linkedin|youtube|mailchimp|sendgrid|sailthru|emltrk|pixel|beacon/i

function extractUrls(body: string): string[] {
  const urls = new Set<string>()
  for (const m of body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    if (m[1].startsWith('http')) urls.add(m[1])
  }
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    urls.add(m[0].replace(/[.,;:]+$/, ''))
  }
  return [...urls]
}

function findTicketUrl(body: string, fromEmail: string): string | undefined {
  const candidates = extractUrls(body).filter(u => !JUNK_URL_RE.test(u))
  if (!candidates.length) return undefined

  const senderDomain = fromEmail.split('@')[1]?.toLowerCase().split('.').slice(-2).join('.')

  const keywordHit = candidates.find(u => TICKET_URL_KEYWORDS.test(u))
  if (keywordHit) return keywordHit

  if (senderDomain) {
    const domainHit = candidates.find(u => u.toLowerCase().includes(senderDomain))
    if (domainHit) return domainHit
  }

  return candidates[0]
}

function isoDate(raw: string): string {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function find(src: string, re: RegExp): string {
  return re.exec(src)?.[1]?.trim() ?? ''
}

// ── Flight Parsers ────────────────────────────────────────────────────────────

const IATA_RE = /\b([A-Z]{3})\b/g
const FLIGHT_NUM_RE = /\b(LY|FR|U2|W6|LH|IZ|TK|AY|BA)\s*(\d{1,4})\b/i
const DATETIME_RE = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})[^\d]*(\d{2}:\d{2})/g
const PRICE_RE = /(?:ILS|₪|EUR|€|USD|\$)\s*([\d,]+)|(\d[\d,]+)\s*(?:ILS|₪|EUR|€|USD|\$)/

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Matches: LY363 *17:30* 15Jul2026 *20:10* 15Jul2026
const ELAL_SEGMENT_RE = /LY(\d{3,4})\s+\*?(\d{2}:\d{2})\*?\s+(\d{1,2}[A-Za-z]{3}\d{4})\s+\*?(\d{2}:\d{2})\*?\s+(\d{1,2}[A-Za-z]{3}\d{4})/g

const FARE_CALC_BLOCKLIST = new Set(['LY', 'USD', 'ILS', 'EUR', 'NUC', 'END', 'ROE', 'EMD', 'ADT', 'INF', 'CHD'])

function parseElAlDate(dateStr: string, time: string): string {
  const m = /(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})/i.exec(dateStr)
  if (!m) return ''
  return `${m[3]}-${MONTH_MAP[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}T${time}`
}

function parseElAlFlights(txt: string): Omit<Flight, 'id'>[] {
  const confirmMatch = /Booking code\s*\*?\s*:\s*([A-Z0-9]{5,8})/i.exec(txt)
  const confirmationNumber = confirmMatch?.[1]

  const costMatch = /Total Amount\s*\*?\s*:\s*(USD|ILS|EUR)\s*([\d.]+)/i.exec(txt)
  const totalCost = costMatch ? parseFloat(costMatch[2]) : 0
  const currency = costMatch?.[1] ?? 'USD'

  const baggageIncluded = /\d+PC/.test(txt)
  const cabinClass: Flight['cabinClass'] = /business/i.test(txt) ? 'business' : /first\s+class/i.test(txt) ? 'first' : 'economy'

  // Extract ordered airport codes from fare calculation line (most reliable source)
  const fareCalcMatch = /Fare Calc(?:ulation)?\s*\*?\s*:\s*([^\r\n]+)/i.exec(txt)
  const airports: string[] = []
  if (fareCalcMatch) {
    const codes = [...fareCalcMatch[1].matchAll(/\b([A-Z]{3})\b/g)]
      .map(m => m[1])
      .filter(c => !FARE_CALC_BLOCKLIST.has(c))
    airports.push(...codes)
  }

  const segments = [...txt.matchAll(ELAL_SEGMENT_RE)]
  if (!segments.length) return []

  const costPerSegment = segments.length > 1 ? Math.round(totalCost / segments.length * 100) / 100 : totalCost

  return segments.map((m, i) => {
    const dep = airports[i] ?? 'TLV'
    const arr = airports[i + 1] ?? ''
    return {
      airline: 'El Al',
      flightNumber: `LY${m[1]}`,
      departureAirport: dep,
      arrivalAirport: arr,
      departureTime: parseElAlDate(m[3], m[2]),
      arrivalTime: parseElAlDate(m[5], m[4]),
      cost: costPerSegment,
      currency,
      direction: (i === 0 ? 'outbound' : 'return') as Flight['direction'],
      cabinClass,
      confirmationNumber,
      baggageIncluded,
    }
  })
}

function parseDateTime(raw: string): string {
  const match = /(\d{1,2})[-/.:](\d{1,2})[-/.:](\d{2,4})[T\s]+(\d{2}:\d{2})/.exec(raw)
  if (!match) return ''
  const [, d, m, y, t] = match
  const year = y.length === 2 ? `20${y}` : y
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${t}`
}

function parseFlightFromText(txt: string, from: string): Omit<Flight, 'id'> | null {
  const flightMatch = FLIGHT_NUM_RE.exec(txt)
  if (!flightMatch) return null

  const airline = resolveAirline(flightMatch[1].toUpperCase(), from)
  const flightNumber = `${flightMatch[1].toUpperCase()} ${flightMatch[2]}`

  const iataCodes = [...txt.matchAll(IATA_RE)].map(m => m[1])
  const departure = iataCodes[0] ?? 'TLV'
  const arrival = iataCodes[1] ?? ''

  const datetimes: string[] = []
  for (const m of txt.matchAll(DATETIME_RE)) {
    const dt = parseDateTime(`${m[1]} ${m[2]}`)
    if (dt) datetimes.push(dt)
  }

  const priceMatch = PRICE_RE.exec(txt)
  const cost = priceMatch ? parseFloat((priceMatch[1] ?? priceMatch[2]).replace(/,/g, '')) : 0
  const currency = /EUR|€/.test(txt) ? 'EUR' : /USD|\$/.test(txt) ? 'USD' : 'ILS'
  const direction = /חזרה|return|back/i.test(txt) ? 'return' : 'outbound'
  const baggageIncluded = /כבודה|baggage included|bag included/i.test(txt)

  return {
    airline,
    flightNumber,
    departureAirport: departure,
    arrivalAirport: arrival,
    departureTime: datetimes[0] ?? '',
    arrivalTime: datetimes[1] ?? '',
    cost,
    currency,
    direction,
    cabinClass: 'economy',
    baggageIncluded,
  }
}

function resolveAirline(iata: string, fromEmail: string): string {
  const map: Record<string, string> = {
    LY: 'El Al', FR: 'Ryanair', U2: 'EasyJet',
    W6: 'Wizz Air', LH: 'Lufthansa', IZ: 'Arkia', TK: 'Turkish Airlines',
  }
  if (map[iata]) return map[iata]
  if (/elal/i.test(fromEmail)) return 'El Al'
  if (/ryanair/i.test(fromEmail)) return 'Ryanair'
  if (/easyjet/i.test(fromEmail)) return 'EasyJet'
  return iata
}

// ── Accommodation Parsers ────────────────────────────────────────────────────

function parseAccommodationFromText(txt: string, subject: string): Omit<Accommodation, 'id'> | null {
  const checkInMatch = /(?:check.in|צ'ק.אין|arrival|הגעה)[:\s]+([^\n,|]{5,30})/i.exec(txt)
  const checkOutMatch = /(?:check.out|צ'ק.אאוט|departure|עזיבה)[:\s]+([^\n,|]{5,30})/i.exec(txt)
  const confirmMatch = /(?:confirmation|אישור|booking|הזמנה)\s*(?:#|number|num|מספר)?[:\s]*([A-Z0-9]{6,20})/i.exec(txt)
  const nameMatch = /(?:hotel|מלון|hostel|אירבנב|airbnb|villa|וילה)[:\s]+([^\n,|]{3,50})/i.exec(txt)
  const priceMatch = PRICE_RE.exec(txt)

  if (!checkInMatch && !checkOutMatch) return null

  const checkIn = isoDate(checkInMatch?.[1] ?? '') || isoDate(new Date().toISOString())
  const checkOut = isoDate(checkOutMatch?.[1] ?? '') || checkIn
  const cost = priceMatch ? parseFloat((priceMatch[1] ?? priceMatch[2]).replace(/,/g, '')) : 0
  const currency = /EUR|€/.test(txt) ? 'EUR' : /USD|\$/.test(txt) ? 'USD' : 'ILS'

  let type: Accommodation['type'] = 'hotel'
  if (/airbnb/i.test(txt)) type = 'airbnb'
  else if (/hostel/i.test(txt)) type = 'hostel'
  else if (/villa/i.test(txt)) type = 'villa'

  return {
    name: nameMatch?.[1] ?? find(subject, /(?:at|ב|:)\s*(.+)$/) ?? 'לינה',
    type,
    checkIn,
    checkOut,
    cost,
    currency,
    confirmationNumber: confirmMatch?.[1],
    rating: 3,
  }
}

// ── Car Rental Parser ─────────────────────────────────────────────────────────

function resolveCarCompany(from: string): string {
  const f = from.toLowerCase()
  if (f.includes('hertz')) return 'Hertz'
  if (f.includes('avis')) return 'Avis'
  if (f.includes('budget')) return 'Budget'
  if (f.includes('europcar')) return 'Europcar'
  if (f.includes('sixt') || f.includes('shlomo')) return 'Sixt'
  if (f.includes('alamo')) return 'Alamo'
  if (f.includes('enterprise')) return 'Enterprise'
  if (f.includes('nationalcar') || f.includes('national')) return 'National'
  if (f.includes('dollar')) return 'Dollar'
  if (f.includes('thrifty')) return 'Thrifty'
  if (f.includes('rentalcars')) return 'Rentalcars.com'
  if (f.includes('autoeurope')) return 'Auto Europe'
  if (f.includes('discovercars')) return 'DiscoverCars'
  if (f.includes('sunnycars')) return 'Sunny Cars'
  if (f.includes('eldan')) return 'אלדן'
  return 'השכרת רכב'
}

function resolveCarCategory(txt: string): CarRental['carCategory'] {
  const t = txt.toLowerCase()
  if (/\bluxury\b|premium|elite|prestige/i.test(t)) return 'luxury'
  if (/\bvan\b|minivan|minibus/i.test(t)) return 'van'
  if (/\bsuv\b|crossover|4x4|4wd/i.test(t)) return 'suv'
  if (/full.?size|full.?class|standard|large/i.test(t)) return 'full-size'
  if (/mid.?size|medium|intermediate/i.test(t)) return 'midsize'
  if (/compact/i.test(t)) return 'compact'
  return 'economy'
}

function parseCarRentalFromText(txt: string, from: string, subject: string): Omit<CarRental, 'id'> | null {
  const pickupMatch =
    /(?:pick.?up\s*(?:date|time)?|collection\s*(?:date)?|איסוף)[:\s]+([^\n,|]{5,40})/i.exec(txt) ??
    /(?:rental\s*starts?|from)[:\s]+([^\n,|]{5,40})/i.exec(txt)

  const dropoffMatch =
    /(?:drop.?off\s*(?:date|time)?|return\s*(?:date)?|החזרה)[:\s]+([^\n,|]{5,40})/i.exec(txt) ??
    /(?:rental\s*ends?|until|to)[:\s]+([^\n,|]{5,40})/i.exec(txt)

  if (!pickupMatch && !dropoffMatch) return null

  const pickupLocationMatch =
    /(?:pick.?up\s*location|pick.?up\s*at|pickup\s*office|station|branch|מיקום\s*איסוף)[:\s]+([^\n,|]{3,60})/i.exec(txt) ??
    /(?:location)[:\s]+([^\n,|]{3,60})/i.exec(txt)

  const dropoffLocationMatch =
    /(?:drop.?off\s*location|return\s*(?:to|at)|return\s*location|מיקום\s*החזרה)[:\s]+([^\n,|]{3,60})/i.exec(txt)

  const confirmMatch =
    /(?:reservation|booking|confirmation|reference|voucher|אישור|הזמנה)\s*(?:#|number|num|no\.?|code|מספר)?[:\s]*([A-Z0-9]{4,20})/i.exec(txt)

  const carTypeMatch =
    /(?:vehicle\s*(?:type|class|group)|car\s*(?:type|class|group)|category|group)[:\s]+([^\n,|]{3,40})/i.exec(txt)

  const carModelMatch =
    /(?:car\s*model|vehicle\s*model|vehicle)[:\s]+([^\n]{3,30})/i.exec(txt)

  const driverMatch =
    /(?:driver|lead\s*driver|נהג\s*ראשי|שם\s*נהג)[:\s]+([^\n,|]{3,40})/i.exec(txt)

  const priceMatch = PRICE_RE.exec(txt)
  const cost = priceMatch ? parseFloat((priceMatch[1] ?? priceMatch[2]).replace(/,/g, '')) : 0
  const currency = /EUR|€/.test(txt) ? 'EUR' : /USD|\$/.test(txt) ? 'USD' : 'ILS'

  const includesInsurance = /(?:full\s*(?:coverage|protection)|cdw|collision\s*damage|super\s*cover|ביטוח\s*כלול)/i.test(txt)

  const pickupDate = isoDate(pickupMatch?.[1] ?? '') || isoDate(new Date().toISOString())
  const dropoffDate = isoDate(dropoffMatch?.[1] ?? '') || pickupDate

  const pickupLocation = pickupLocationMatch?.[1]?.trim() ?? find(subject, /(?:at|ב|–|-)\s*(.+)$/) ?? ''
  const dropoffLocation = dropoffLocationMatch?.[1]?.trim()

  const carCategory = resolveCarCategory(carTypeMatch?.[1] ?? txt.slice(0, 300))

  return {
    company: resolveCarCompany(from),
    carModel: carModelMatch?.[1]?.trim(),
    carCategory,
    pickupLocation,
    dropoffLocation: dropoffLocation !== pickupLocation ? dropoffLocation : undefined,
    pickupDate,
    dropoffDate,
    cost,
    currency,
    confirmationNumber: confirmMatch?.[1],
    driverName: driverMatch?.[1]?.trim(),
    includesInsurance,
  }
}

// ── Event Parser ─────────────────────────────────────────────────────────────

function parseEventFromText(txt: string, subject: string): Omit<TripEvent, 'id' | 'dayId'> | null {
  const dateMatch = /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/g.exec(txt)
  const timeMatch = /(\d{2}:\d{2})/.exec(txt)
  if (!dateMatch) return null

  const priceMatch = PRICE_RE.exec(txt)
  const cost = priceMatch ? parseFloat((priceMatch[1] ?? priceMatch[2]).replace(/,/g, '')) : 0

  return {
    startTime: timeMatch?.[1] ?? '10:00',
    title: subject.replace(/^(?:re:|fwd?:)\s*/i, '').slice(0, 60),
    category: 'activity',
    cost,
  }
}

// ── Classifier ───────────────────────────────────────────────────────────────

const CAR_RENTAL_FROM_RE = /hertz|avis|budget|europcar|sixt|shlomo|alamo|enterprise|nationalcar|dollar|thrifty|rentalcars|autoeurope|discovercars|sunnycars|eldan/i
const CAR_RENTAL_SUBJ_RE = /car\s*rental|rent.a.car|vehicle\s*rental|reservation|השכרת\s*רכב|אישור\s*הזמנה/i

function classify(msg: GmailMessage): ParsedEmailType {
  const from = msg.from.toLowerCase()
  const subj = msg.subject.toLowerCase()
  const body = msg.body.toLowerCase()

  if (/el\s*al|ryanair|easyjet|wizzair|lufthansa|israir|arkia|turkish|flight|טיסה/i.test(`${from} ${subj}`)) return 'flight'
  if (/booking\.com|airbnb|hotels\.com|hostelworld|מלון|hotel|check.in/i.test(`${from} ${subj} ${body}`)) return 'accommodation'
  if (CAR_RENTAL_FROM_RE.test(from) || (CAR_RENTAL_FROM_RE.test(from) && CAR_RENTAL_SUBJ_RE.test(subj))) return 'car-rental'
  if (CAR_RENTAL_SUBJ_RE.test(subj) && /pick.?up|drop.?off|איסוף|החזרה/i.test(`${subj} ${body}`)) return 'car-rental'
  if (/getyourguide|viator|klook|activity|tour|tickets?/i.test(`${from} ${subj}`)) return 'event'
  if (FLIGHT_NUM_RE.test(body)) return 'flight'
  return 'unknown'
}

// ── Main Parse Function ───────────────────────────────────────────────────────

export function parseEmails(messages: GmailMessage[]): ParsedEmail[] {
  return messages.flatMap((msg): ParsedEmail[] => {
    const type = classify(msg)
    const txt = text(msg)
    const base = { subject: msg.subject, from: msg.from, date: msg.date }

    if (type === 'flight') {
      const ticketUrl = findTicketUrl(msg.body, msg.from)
      const isElAl = /el\s*al|elal-ticketing/i.test(`${msg.from} ${msg.subject} ${txt.slice(0, 500)}`)
      if (isElAl) {
        const flights = parseElAlFlights(txt)
        if (flights.length) {
          return flights.map((flight, i) => ({
            ...base,
            messageId: `${msg.id}:${i}`,
            subject: `${msg.subject} — ${flight.flightNumber} ${flight.departureAirport}→${flight.arrivalAirport}`,
            type: 'flight' as const,
            flight: { ...flight, ticketUrl },
          }))
        }
      }
      const flight = parseFlightFromText(txt, msg.from)
      if (flight) return [{ ...base, messageId: msg.id, type: 'flight', flight: { ...flight, ticketUrl } }]
    }

    if (type === 'accommodation') {
      const accommodation = parseAccommodationFromText(txt, msg.subject)
      if (accommodation) return [{ ...base, messageId: msg.id, type: 'accommodation', accommodation }]
    }

    if (type === 'car-rental') {
      const carRental = parseCarRentalFromText(txt, msg.from, msg.subject)
      if (carRental) return [{ ...base, messageId: msg.id, type: 'car-rental', carRental }]
    }

    if (type === 'event') {
      const event = parseEventFromText(txt, msg.subject)
      if (event) return [{ ...base, messageId: msg.id, type: 'event', event }]
    }

    return []
  })
}
