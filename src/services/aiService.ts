import type { AiMessage } from '@/stores/aiStore'
import type { TripPlan } from '@/types/trip-plan'
import type { AiSuggestedDay } from '@/types/ai-itinerary'
import { assertProductAiEnabled } from '@/lib/aiFeatures'

interface AiConfig {
  provider: 'openai' | 'ollama'
  openaiApiKey: string
  openaiModel: string
  ollamaUrl: string
  ollamaModel: string
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

function buildSystemPrompt(trip: TripPlan): string {
  const days = trip.days.length
  const familyDesc = trip.family.map(m => `${m.name} (${m.emoji})`).join(', ')
  const spent = trip.budget.items.reduce((s, i) => s + (i.actual ?? i.planned), 0)
  const eventsCount = trip.days.reduce((s, d) => s + d.events.length, 0)

  return `אתה עוזר נסיעות חכם לתכנון טיול משפחתי.

פרטי הטיול:
- יעד: ${trip.destination}
- תאריכים: ${trip.startDate} עד ${trip.endDate} (${days} ימים)
- משפחה: ${familyDesc || 'לא הוגדר'}
- תקציב: ${trip.budget.totalBudget} ${trip.budget.currency} (נוצל: ${Math.round(spent)} ${trip.budget.currency})
- אירועים מתוכננים: ${eventsCount}

הנחיות:
- ענה תמיד בעברית
- היה ספציפי ופרקטי
- התחשב בנתוני הטיול שלמעלה
- כשמציע פעילויות — ציין שעה משוערת, מחיר משוער ומשך
- כשמציע אריזה — ציין כמות ועדיפות`
}

export async function sendAiMessage(
  messages: AiMessage[],
  trip: TripPlan,
  config: AiConfig
): Promise<string> {
  assertProductAiEnabled()
  const systemPrompt = buildSystemPrompt(trip)

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  if (config.provider === 'openai') {
    return sendOpenAi(chatMessages, config)
  } else {
    return sendOllama(chatMessages, config)
  }
}

async function sendOpenAi(messages: ChatMessage[], config: AiConfig): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({ model: config.openaiModel, messages, stream: false }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `OpenAI error ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function sendOllama(messages: ChatMessage[], config: AiConfig): Promise<string> {
  const url = config.ollamaUrl.replace(/\/$/, '') + '/api/chat'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.ollamaModel, messages, stream: false }),
  })

  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}`)
  }

  const data = await res.json()
  return data.message?.content ?? ''
}

function buildDayPrompt(
  trip: TripPlan,
  dayDate: string,
  dayIndex: number,
  constraints: string
): string {
  const base = buildSystemPrompt(trip)

  // Accommodation info for this specific date
  const accForDay = trip.accommodations.filter(acc => acc.checkIn <= dayDate && acc.checkOut > dayDate)
  const accText = accForDay.length
    ? accForDay.map(a => `${a.name}${a.address ? ` (${a.address})` : ''}`).join(', ')
    : 'לא הוגדרה לינה ליום זה'

  // Destination coords if available
  const coordsText = trip.coords
    ? `קואורדינטות היעד: ${trip.coords.lat}, ${trip.coords.lon}`
    : ''

  // Existing events that day (to avoid duplication)
  const existingDay = trip.days.find(d => d.date === dayDate)
  const existingText = existingDay?.events.length
    ? `אירועים כבר מתוכננים ביום זה (אל תשכפל): ${existingDay.events.map(e => e.title).join(', ')}`
    : ''

  const constraintText = constraints.trim()
    ? `מגבלות ובקשות מיוחדות ליום זה: ${constraints.trim()}`
    : ''

  return `${base}
${coordsText}

משימה: צור מסלול מפורט ליום אחד בלבד.
יום ${dayIndex + 1} מתוך ${trip.days.length} — תאריך: ${dayDate}
לינה ביום זה: ${accText}
${existingText}
${constraintText}

חוקים קריטיים — עקוב אחריהם בדיוק:
1. ענה ONLY ב-JSON תקני — ללא טקסט לפני או אחרי
2. מבנה: { "date": "${dayDate}", "dayLabel": "...", "events": [...] }
3. כל אירוע: { "title": "...", "startTime": "HH:MM", "endTime": "HH:MM", "category": "activity|meal|transport|rest|tour", "location": "שם מקום מלא וספציפי", "lat": מספר, "lng": מספר, "description": "...", "cost": מספר }
4. lat ו-lng חייבים להיות קואורדינטות WGS84 מדויקות של המיקום (לא 0, לא null)
5. תכנן מסלול גיאוגרפי יעיל — התחל מהלינה, קבץ מקומות סמוכים, מזער נסיעות מיותרות
6. 4-6 אירועים, התחל ב-08:00 וסיים לפני 22:00
7. כלול ארוחות ופעילויות
8. עלויות ב-${trip.budget.currency}`
}

export async function generateDayItinerary(
  trip: TripPlan,
  dayDate: string,
  dayIndex: number,
  constraints: string,
  config: AiConfig
): Promise<AiSuggestedDay> {
  assertProductAiEnabled()
  const messages: ChatMessage[] = [
    { role: 'system', content: buildDayPrompt(trip, dayDate, dayIndex, constraints) },
    { role: 'user', content: `צור מסלול ליום ${dayIndex + 1} (${dayDate}) ב${trip.destination}.` },
  ]

  const raw = config.provider === 'openai'
    ? await sendOpenAi(messages, config)
    : await sendOllama(messages, config)

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  let parsed: AiSuggestedDay
  try {
    parsed = JSON.parse(cleaned) as AiSuggestedDay
  } catch {
    throw new Error('המודל החזיר תגובה שאינה JSON תקני. נסה שוב.')
  }

  if (!parsed.events?.length) {
    throw new Error('לא נוצרו אירועים. נסה שוב.')
  }

  return { ...parsed, date: dayDate }
}
