// AI-powered import modal: drag-drop a PDF / paste text / paste email →
// Gemini extracts bookings → preview → user confirms → injected into trip store.
//
// Browser-side text extraction:
//   - text/plain, text/html, .eml, .ics → read as text
//   - PDF → strip /Length stream operators with a tiny built-in extractor;
//     for complex PDFs the user can paste text manually as fallback
//   - images → not yet (would need Gemini Vision; future iteration)

import { useState } from 'react'
import { Modal, Button, Stack, Typography, Card, Badge } from 'myk-library'
import { Upload, Sparkles, Check, AlertCircle } from 'lucide-react'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { parseDocument, type ParseDocumentResponse } from '@/lib/aiClient'
import {
  createMergeSession, mergeByConfirmation, sameFlightDirection,
  isPlaceholderFlight, isPlaceholderHotel, isPlaceholderCar,
} from '@/lib/tripMerge'
import { generateId } from '@/utils/id'
import type { Flight, Accommodation, CarRental } from '@/types/accommodation'
import type { TripPlan } from '@/types/trip-plan'

interface Props {
  isOpen: boolean
  onClose: () => void
  trip: TripPlan
}

const DropZone = styled.label<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  border: 2px dashed ${({ $active }) => ($active ? '#3b82f6' : '#cbd5e1')};
  border-radius: 12px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? '#eff6ff' : '#f8fafc')};
  transition: all 0.15s ease;
  &:hover { border-color: #3b82f6; background: #eff6ff; }
`
const TextArea = styled.textarea`
  width: 100%;
  min-height: 140px;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
`
const PreviewCard = styled(Card)`
  padding: 12px;
  background: #f8fafc;
`

type Stage = 'idle' | 'extracting' | 'parsing' | 'preview' | 'done' | 'error'

export default function SmartImportModal({ isOpen, onClose, trip }: Props) {
  const [stage, setStage] = useState<Stage>('idle')
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [drag, setDrag] = useState(false)
  const [parsed, setParsed] = useState<ParseDocumentResponse | null>(null)
  const [error, setError] = useState('')
  // We bypass the per-record store actions because the merge logic needs to
  // mutate the trip's arrays atomically (with placeholder upgrades + per-leg
  // dedup). Set state directly via useTripStore.setState below.

  const reset = () => {
    setStage('idle'); setText(''); setFilename(''); setParsed(null); setError('')
  }
  const handleClose = () => { reset(); onClose() }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    setFilename(file.name)
    setStage('extracting')
    try {
      const extracted = await extractTextFromFile(file)
      if (!extracted.trim()) {
        throw new Error('הקובץ ריק או שלא הצלחתי לחלץ ממנו טקסט. נסה להדביק את הטקסט ידנית.')
      }
      setText(extracted)
      await runParse(extracted, file.name)
    } catch (e) {
      setStage('error'); setError(e instanceof Error ? e.message : String(e))
    }
  }

  const runParse = async (input: string, sourceName?: string) => {
    setStage('parsing')
    try {
      const res = await parseDocument({
        text: input,
        hint: {
          today: new Date().toISOString().slice(0, 10),
          tripStart: trip.startDate,
          tripEnd: trip.endDate,
          destination: trip.destination,
          sourceFilename: sourceName,
        },
      })
      setParsed(res)
      setStage('preview')
    } catch (e) {
      setStage('error'); setError(e instanceof Error ? e.message : String(e))
    }
  }

  const onParseText = () => {
    if (!text.trim()) return
    void runParse(text)
  }

  const onConfirm = () => {
    if (!parsed) return
    const session = createMergeSession()
    const now = new Date().toISOString()
    useTripStore.setState(state => ({
      trips: state.trips.map(t => {
        if (t.id !== trip.id) return t
        const flights = [...t.flights]
        const accommodations = [...t.accommodations]
        const carRentals = [...(t.carRentals ?? [])]
        for (const f of parsed.flights ?? []) {
          mergeByConfirmation<Flight>(flights, {
            airline: f.airline, flightNumber: f.flightNumber,
            departureAirport: f.departureAirport, arrivalAirport: f.arrivalAirport,
            departureTime: f.departureTime, arrivalTime: f.arrivalTime,
            cost: f.cost ?? 0, currency: f.currency ?? t.budget.currency,
            direction: f.direction, cabinClass: f.cabinClass ?? 'economy',
            confirmationNumber: f.confirmationNumber,
            baggageIncluded: f.baggageIncluded, ticketUrl: f.ticketUrl,
          }, isPlaceholderFlight, generateId, session, sameFlightDirection)
        }
        for (const a of parsed.accommodations ?? []) {
          mergeByConfirmation<Accommodation>(accommodations, {
            name: a.name, type: a.type, address: a.address,
            checkIn: a.checkIn, checkOut: a.checkOut,
            cost: a.cost ?? 0, currency: a.currency ?? t.budget.currency,
            confirmationNumber: a.confirmationNumber, notes: a.notes,
          }, isPlaceholderHotel, generateId, session)
        }
        for (const c of parsed.carRentals ?? []) {
          mergeByConfirmation<CarRental>(carRentals, {
            company: c.company, carModel: c.carModel, carCategory: c.carCategory,
            pickupLocation: c.pickupLocation, dropoffLocation: c.dropoffLocation,
            pickupDate: c.pickupDate, dropoffDate: c.dropoffDate,
            cost: c.cost ?? 0, currency: c.currency ?? t.budget.currency,
            confirmationNumber: c.confirmationNumber, driverName: c.driverName,
            includesInsurance: c.includesInsurance,
          }, isPlaceholderCar, generateId, session)
        }
        return { ...t, flights, accommodations, carRentals, updatedAt: now }
      }),
    }))
    setStage('done')
    setTimeout(handleClose, 1200)
  }

  const totals = parsed && {
    flights: parsed.flights?.length ?? 0,
    hotels: parsed.accommodations?.length ?? 0,
    cars: parsed.carRentals?.length ?? 0,
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="🤖 ייבוא חכם בעזרת AI" size="md">
      <Stack direction="column" spacing="md" style={{ padding: 4 }}>
        {stage === 'idle' && (
          <>
            <Typography variant="body2" style={{ color: '#475569' }}>
              גרור קובץ (PDF, .eml, .txt, .html) או הדבק טקסט. ה-AI יזהה טיסות, מלונות ורכבים — ויוסיף אותם לטיול הזה.
            </Typography>
            <DropZone
              $active={drag}
              onDragEnter={e => { e.preventDefault(); setDrag(true) }}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); void onFiles(e.dataTransfer.files) }}
            >
              <Upload size={28} color="#3b82f6" />
              <Typography variant="body2" style={{ fontWeight: 600 }}>גרור קובץ או לחץ לבחירה</Typography>
              <Typography variant="body2" style={{ fontSize: 12, color: '#6b7280' }}>PDF, .eml, .txt, .html</Typography>
              <input
                type="file"
                accept=".pdf,.eml,.txt,.html,.htm,.ics,application/pdf,text/*,message/rfc822"
                style={{ display: 'none' }}
                onChange={e => onFiles(e.target.files)}
              />
            </DropZone>
            <Typography variant="body2" style={{ textAlign: 'center', color: '#94a3b8' }}>או</Typography>
            <TextArea
              placeholder="הדבק כאן את גוף המייל / טקסט הכרטיס..."
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <Button variant="primary" onClick={onParseText} disabled={!text.trim()}>
              <Stack direction="row" spacing="xs" align="center">
                <Sparkles size={16} /><span>נתח עם AI</span>
              </Stack>
            </Button>
          </>
        )}

        {(stage === 'extracting' || stage === 'parsing') && (
          <Stack direction="column" align="center" spacing="sm" style={{ padding: 24 }}>
            <Sparkles size={32} className="spin" color="#3b82f6" />
            <Typography variant="body2">
              {stage === 'extracting' ? `מחלץ טקסט מ-${filename}…` : 'AI מנתח את הטקסט…'}
            </Typography>
          </Stack>
        )}

        {stage === 'preview' && parsed && (
          <>
            <Stack direction="row" spacing="sm" align="center" justify="between">
              <Typography variant="h6" style={{ margin: 0 }}>נמצאו פריטים:</Typography>
              <Badge variant={parsed.documentType === 'unknown' ? 'warning' : 'success'} size="sm">
                {parsed.documentType}
              </Badge>
            </Stack>

            {!totals?.flights && !totals?.hotels && !totals?.cars && (
              <PreviewCard>
                <Stack direction="row" spacing="sm" align="center">
                  <AlertCircle size={16} color="#f59e0b" />
                  <Typography variant="body2">לא נמצאו פריטים בני ייבוא בטקסט הזה.</Typography>
                </Stack>
              </PreviewCard>
            )}

            {parsed.flights?.map((f, i) => (
              <PreviewCard key={`f${i}`}>
                <Typography variant="body2" style={{ fontWeight: 600 }}>
                  ✈️ {f.airline} {f.flightNumber} · {f.departureAirport}→{f.arrivalAirport}
                </Typography>
                <Typography variant="body2" style={{ fontSize: 12, color: '#6b7280' }}>
                  {f.departureTime} → {f.arrivalTime} · {f.direction === 'outbound' ? 'הלוך' : 'חזור'}
                  {f.cost ? ` · ${f.cost} ${f.currency}` : ''}
                </Typography>
              </PreviewCard>
            ))}
            {parsed.accommodations?.map((a, i) => (
              <PreviewCard key={`a${i}`}>
                <Typography variant="body2" style={{ fontWeight: 600 }}>🏨 {a.name}</Typography>
                <Typography variant="body2" style={{ fontSize: 12, color: '#6b7280' }}>
                  {a.address ?? ''} · {a.checkIn} → {a.checkOut}{a.cost ? ` · ${a.cost} ${a.currency}` : ''}
                </Typography>
              </PreviewCard>
            ))}
            {parsed.carRentals?.map((c, i) => (
              <PreviewCard key={`c${i}`}>
                <Typography variant="body2" style={{ fontWeight: 600 }}>
                  🚗 {c.company} · {c.carCategory}
                </Typography>
                <Typography variant="body2" style={{ fontSize: 12, color: '#6b7280' }}>
                  {c.pickupLocation} · {c.pickupDate} → {c.dropoffDate}
                </Typography>
              </PreviewCard>
            ))}

            {parsed.warnings?.map((w, i) => (
              <Typography key={i} variant="body2" style={{ fontSize: 12, color: '#b45309' }}>
                ⚠ {w}
              </Typography>
            ))}

            <Stack direction="row" spacing="sm" justify="between">
              <Button variant="ghost" onClick={reset}>חזור</Button>
              <Button
                variant="primary"
                onClick={onConfirm}
                disabled={!totals?.flights && !totals?.hotels && !totals?.cars}
              >
                הוסף לטיול ({(totals?.flights ?? 0) + (totals?.hotels ?? 0) + (totals?.cars ?? 0)})
              </Button>
            </Stack>
          </>
        )}

        {stage === 'done' && (
          <Stack direction="column" align="center" spacing="sm" style={{ padding: 24 }}>
            <Check size={32} color="#10b981" />
            <Typography variant="body2" style={{ fontWeight: 600 }}>נוסף בהצלחה!</Typography>
          </Stack>
        )}

        {stage === 'error' && (
          <Stack direction="column" spacing="sm">
            <Stack direction="row" spacing="sm" align="center">
              <AlertCircle size={20} color="#ef4444" />
              <Typography variant="body2" style={{ color: '#b91c1c' }}>{error}</Typography>
            </Stack>
            <Button variant="ghost" onClick={reset}>נסה שוב</Button>
          </Stack>
        )}
      </Stack>
    </Modal>
  )
}

// ─── File extractors ────────────────────────────────────────────────────────

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const mime = file.type
  if (mime.startsWith('text/') || ['txt', 'eml', 'html', 'htm', 'ics'].includes(ext)) {
    return await file.text()
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return extractPdfText(await file.arrayBuffer())
  }
  // Unknown — try as text anyway
  return await file.text()
}

// Minimal PDF text extractor — pulls strings from "(...) Tj" and "(...) TJ"
// operators. Handles ~80% of e-tickets (which embed text in plain content streams).
// For complex/scanned PDFs the user can paste text via the textarea fallback.
function extractPdfText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  // Decode as latin1 to preserve byte layout — PDF strings are byte-oriented.
  let raw = ''
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i])

  const out: string[] = []
  // Match (string) Tj  or  (string) TJ  or [(s1)(s2)] TJ
  const opRe = /\(((?:\\.|[^\\()])*)\)\s*Tj|\[(.*?)\]\s*TJ/g
  let m: RegExpExecArray | null
  while ((m = opRe.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      out.push(unescapePdfString(m[1]))
    } else if (m[2] !== undefined) {
      const arr = m[2]
      const innerRe = /\(((?:\\.|[^\\()])*)\)/g
      let im: RegExpExecArray | null
      while ((im = innerRe.exec(arr)) !== null) out.push(unescapePdfString(im[1]))
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
}
