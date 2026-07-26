import { useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
// Lives here rather than in main.tsx so Leaflet's CSS ships with this lazy
// chunk instead of the app-wide stylesheet.
import 'leaflet/dist/leaflet.css'
import { Modal, Button, Stack, Typography, Badge, Alert, Spinner } from 'myk-library'
import styled from 'styled-components'
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Calendar, RefreshCw } from 'lucide-react'
import { useAiStore } from '@/stores/aiStore'
import { useTripStore } from '@/stores/tripStore'
import { generateDayItinerary } from '@/services/aiService'
import { formatDateShort } from '@/utils/date'
import type {
  AiItineraryDayState,
  AiItineraryEventState,
  ItineraryBuilderStep,
} from '@/types/ai-itinerary'
import type { TripDay } from '@/types/trip'

interface Props {
  open: boolean
  onClose: () => void
  tripId: string
}

// Amber pill marker for the mini map
const AI_ICON = L.divIcon({
  className: '',
  html: '<div style="width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
})

const CATEGORY_LABELS: Record<string, string> = {
  activity: '🎯 פעילות',
  meal: '🍽️ ארוחה',
  transport: '🚗 תחבורה',
  tour: '🗺️ סיור',
  rest: '😴 מנוחה',
}

const CATEGORY_BADGE: Record<string, 'warning' | 'success' | 'info' | 'default'> = {
  activity: 'warning',
  meal: 'success',
  transport: 'info',
  tour: 'default',
  rest: 'default',
}

// ── Styled components ──────────────────────────────────────────────────────────

const DayList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 55vh;
  overflow-y: auto;
  padding: 2px;
`

const DayRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.gray[50]};
`

const ScrollArea = styled.div`
  max-height: 38vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
`

const DaySection = styled.div`
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  overflow: hidden;
`

const DayHeader = styled.div`
  background: ${({ theme }) => theme.colors.gray[100]};
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const EventRow = styled.div<{ $rejected: boolean }>`
  padding: 10px 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.gray[100]};
  opacity: ${({ $rejected }) => ($rejected ? 0.4 : 1)};
  transition: opacity 0.15s;
`

const EventInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const ToggleBtn = styled.button<{ $approved: boolean }>`
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  color: ${({ $approved, theme }) =>
    $approved ? '#10b981' : theme.colors.gray[300]};
  transition: color 0.15s;
  display: flex;
  align-items: center;
`

const InlineEditRow = styled.div`
  padding: 8px 16px 10px 16px;
  background: ${({ theme }) => theme.colors.gray[50]};
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray[200]};
`

const SmallInput = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.gray[50]};
  color: ${({ theme }) => theme.colors.gray[900]};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary[500]}; }
`

const ConstraintArea = styled.textarea`
  width: 100%;
  resize: none;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  background: ${({ theme }) => theme.colors.gray[50]};
  color: ${({ theme }) => theme.colors.gray[900]};
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: ${({ theme }) => theme.colors.primary[500]}; }
`

const MapWrapper = styled.div`
  border-radius: 8px;
  overflow: hidden;
  height: 220px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
`

const ExpandBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.gray[400]};
  display: flex;
  align-items: center;
  padding: 0;
  font-size: 11px;
  gap: 2px;
  &:hover { color: ${({ theme }) => theme.colors.gray[600]}; }
`

// ── Mini map ───────────────────────────────────────────────────────────────────

function DayMiniMap({ events }: { events: AiItineraryEventState[] }) {
  const withCoords = events.filter(e => e.lat != null && e.lng != null && e._status === 'approved')
  if (!withCoords.length) return null

  const center: [number, number] = [withCoords[0].lat!, withCoords[0].lng!]
  const polyline: [number, number][] = withCoords.map(e => [e.lat!, e.lng!])

  return (
    <MapWrapper>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Polyline positions={polyline} color="#f59e0b" weight={2} opacity={0.7} />
        {withCoords.map((ev, i) => (
          <Marker key={i} position={[ev.lat!, ev.lng!]} icon={AI_ICON}>
            <Popup>
              <strong>{ev.title}</strong><br />{ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </MapWrapper>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AiItineraryModal({ open, onClose, tripId }: Props) {
  const [step, setStep] = useState<ItineraryBuilderStep>('idle')
  const [selectedDay, setSelectedDay] = useState<TripDay | null>(null)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [constraintText, setConstraintText] = useState('')
  const [reviewDay, setReviewDay] = useState<AiItineraryDayState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null)

  const { provider, openaiApiKey, openaiModel, ollamaUrl, ollamaModel } = useAiStore()
  const trips = useTripStore(s => s.trips)
  const addEvent = useTripStore(s => s.addEvent)
  const trip = useMemo(() => trips.find(t => t.id === tripId), [trips, tripId])

  function handleClose() {
    setStep('idle')
    setSelectedDay(null)
    setConstraintText('')
    setReviewDay(null)
    setError(null)
    setExpandedEvent(null)
    onClose()
  }

  function handlePickDay(day: TripDay, index: number) {
    setSelectedDay(day)
    setSelectedDayIndex(index)
    setConstraintText('')
    setReviewDay(null)
    setError(null)
    setExpandedEvent(null)
    setStep('constraints')
  }

  async function handleGenerate() {
    if (!trip || !selectedDay) return
    setStep('loading')
    setError(null)
    try {
      const suggested = await generateDayItinerary(
        trip,
        selectedDay.date,
        selectedDayIndex,
        constraintText,
        { provider, openaiApiKey, openaiModel, ollamaUrl, ollamaModel }
      )
      const dayState: AiItineraryDayState = {
        date: suggested.date,
        dayLabel: suggested.dayLabel,
        events: suggested.events.map(e => ({ ...e, _status: 'approved' as const })),
      }
      setReviewDay(dayState)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
      setStep('error')
    }
  }

  function handleToggleEvent(idx: number) {
    if (!reviewDay) return
    setReviewDay({
      ...reviewDay,
      events: reviewDay.events.map((ev, i) =>
        i === idx ? { ...ev, _status: ev._status === 'approved' ? 'rejected' : 'approved' } : ev
      ),
    })
    setExpandedEvent(null)
  }

  function handleEditEvent(idx: number, patch: Partial<AiItineraryEventState>) {
    if (!reviewDay) return
    setReviewDay({
      ...reviewDay,
      events: reviewDay.events.map((ev, i) => i === idx ? { ...ev, ...patch } : ev),
    })
  }

  function handleApproveAll() {
    if (!reviewDay) return
    setReviewDay({
      ...reviewDay,
      events: reviewDay.events.map(ev => ({ ...ev, _status: 'approved' as const })),
    })
  }

  function handleCommitDay() {
    if (!reviewDay) return
    for (const event of reviewDay.events) {
      if (event._status !== 'approved') continue
      const { _status, lat, lng, ...eventData } = event
      void _status; void lat; void lng
      addEvent(tripId, reviewDay.date, eventData)
    }
    setStep('idle')
    setSelectedDay(null)
    setReviewDay(null)
  }

  const approvedCount = reviewDay?.events.filter(e => e._status === 'approved').length ?? 0

  const formatDate = (date: string) => {
    try { return formatDateShort(date) } catch { return date }
  }

  const modalTitle = step === 'constraints' && selectedDay
    ? `יום ${selectedDayIndex + 1} — ${formatDate(selectedDay.date)}`
    : step === 'review' && reviewDay
      ? `סקירה: יום ${selectedDayIndex + 1} — ${formatDate(reviewDay.date)}`
      : 'בנה מסלול יום-יום עם AI ✨'

  return (
    <Modal isOpen={open} onClose={handleClose} title={modalTitle} size="lg">
      <Stack direction="column" spacing="md">

        {/* ── Day Picker ─────────────────────────────────────────────────── */}
        {step === 'idle' && trip && (
          <>
            <Typography variant="body2" style={{ color: '#9ca3af' }}>
              בחר יום לתכנן — האI יבנה מסלול גיאוגרפי יעיל מתחנת הלינה שלך
            </Typography>
            <DayList>
              {trip.days.map((day, index) => {
                const eventCount = day.events.length
                return (
                  <DayRow key={day.id}>
                    <Stack direction="row" spacing="sm" align="center">
                      <Calendar size={14} style={{ color: '#9ca3af' }} />
                      <Typography variant="body2" style={{ fontWeight: 500 }}>
                        יום {index + 1} — {formatDate(day.date)}
                      </Typography>
                      {eventCount > 0 && (
                        <Badge variant="success" size="sm">{eventCount} אירועים</Badge>
                      )}
                    </Stack>
                    <Button
                      size="sm"
                      variant={eventCount > 0 ? 'secondary' : 'primary'}
                      onClick={() => handlePickDay(day, index)}
                    >
                      {eventCount > 0 ? (
                        <Stack direction="row" spacing="xs" align="center">
                          <RefreshCw size={12} /><span>תכנן מחדש</span>
                        </Stack>
                      ) : 'תכנן יום זה'}
                    </Button>
                  </DayRow>
                )
              })}
            </DayList>
          </>
        )}

        {/* ── Constraint Input ───────────────────────────────────────────── */}
        {step === 'constraints' && selectedDay && (
          <Stack direction="column" spacing="md">
            <Typography variant="body2" style={{ color: '#6b7280' }}>
              הוסף מגבלות או בקשות מיוחדות ליום זה (אופציונלי):
            </Typography>
            <ConstraintArea
              rows={3}
              value={constraintText}
              onChange={e => setConstraintText(e.target.value)}
              placeholder={'למשל: "יש לנו רכב", "ילדים עייפים — להישאר קרוב למלון", "מעוניינים בחוף ים"'}
              dir="rtl"
            />
            <Stack direction="row" spacing="sm">
              <Button variant="ghost" onClick={() => setStep('idle')}>חזור</Button>
              <Button variant="primary" style={{ flex: 1 }} onClick={handleGenerate}>
                צור מסלול ליום זה
              </Button>
            </Stack>
          </Stack>
        )}

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {step === 'loading' && (
          <Stack direction="column" align="center" spacing="md" style={{ padding: '32px 0' }}>
            <Spinner size="lg" />
            <Typography variant="body2" style={{ color: '#9ca3af' }}>
              AI בונה מסלול גיאוגרפי ליום {selectedDayIndex + 1}...
            </Typography>
          </Stack>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {step === 'error' && (
          <Stack direction="column" spacing="md">
            <Alert variant="error" title="שגיאה">{error}</Alert>
            <Stack direction="row" spacing="sm">
              <Button variant="ghost" onClick={() => setStep('constraints')}>ערוך מגבלות</Button>
              <Button variant="secondary" onClick={handleGenerate}>נסה שוב</Button>
            </Stack>
          </Stack>
        )}

        {/* ── Review ────────────────────────────────────────────────────── */}
        {step === 'review' && reviewDay && (
          <>
            <DayMiniMap events={reviewDay.events} />

            <DaySection>
              <DayHeader>
                <Typography variant="body2" style={{ fontWeight: 600 }}>
                  {reviewDay.dayLabel ?? formatDate(reviewDay.date)}
                </Typography>
                <Button size="sm" variant="ghost" onClick={handleApproveAll}>
                  אשר הכל
                </Button>
              </DayHeader>

              <ScrollArea>
                {reviewDay.events.map((event, idx) => (
                  <div key={idx}>
                    <EventRow $rejected={event._status === 'rejected'}>
                      <ToggleBtn
                        $approved={event._status === 'approved'}
                        onClick={() => handleToggleEvent(idx)}
                        title={event._status === 'approved' ? 'הסר' : 'הוסף'}
                      >
                        {event._status === 'approved'
                          ? <CheckCircle size={20} />
                          : <XCircle size={20} />
                        }
                      </ToggleBtn>

                      <EventInfo>
                        <Stack direction="row" spacing="xs" align="center" style={{ flexWrap: 'wrap', gap: 4 }}>
                          <Typography variant="body2" style={{ fontWeight: 500 }}>
                            {event.title}
                          </Typography>
                          <Badge variant={CATEGORY_BADGE[event.category] ?? 'default'} size="sm">
                            {CATEGORY_LABELS[event.category] ?? event.category}
                          </Badge>
                        </Stack>
                        <Stack direction="row" spacing="xs" style={{ marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
                          <Typography variant="caption" style={{ color: '#9ca3af' }}>
                            {event.startTime}{event.endTime ? `–${event.endTime}` : ''}
                          </Typography>
                          {event.location && (
                            <Typography variant="caption" style={{ color: '#9ca3af' }}>
                              📍 {event.location}
                              {event.lat && event.lng ? ` (${event.lat.toFixed(4)}, ${event.lng.toFixed(4)})` : ''}
                            </Typography>
                          )}
                          {event.cost !== undefined && (
                            <Typography variant="caption" style={{ color: '#9ca3af' }}>
                              💰 {event.cost} {trip?.budget.currency}
                            </Typography>
                          )}
                        </Stack>
                        {event.description && (
                          <Typography variant="caption" style={{ color: '#6b7280', marginTop: 2 }}>
                            {event.description}
                          </Typography>
                        )}
                      </EventInfo>

                      <ExpandBtn
                        onClick={() => setExpandedEvent(expandedEvent === idx ? null : idx)}
                        title="עריכה מהירה"
                      >
                        {expandedEvent === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </ExpandBtn>
                    </EventRow>

                    {expandedEvent === idx && (
                      <InlineEditRow>
                        <SmallInput
                          value={event.title}
                          onChange={e => handleEditEvent(idx, { title: e.target.value })}
                          placeholder="כותרת"
                          style={{ flex: 2, minWidth: 120 }}
                          dir="rtl"
                        />
                        <SmallInput
                          value={event.startTime}
                          onChange={e => handleEditEvent(idx, { startTime: e.target.value })}
                          placeholder="שעת התחלה"
                          style={{ width: 80 }}
                          dir="ltr"
                        />
                        <SmallInput
                          value={event.endTime ?? ''}
                          onChange={e => handleEditEvent(idx, { endTime: e.target.value })}
                          placeholder="שעת סיום"
                          style={{ width: 80 }}
                          dir="ltr"
                        />
                        <SmallInput
                          type="number"
                          value={event.cost ?? ''}
                          onChange={e => handleEditEvent(idx, { cost: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="עלות"
                          style={{ width: 70 }}
                          dir="ltr"
                        />
                      </InlineEditRow>
                    )}
                  </div>
                ))}
              </ScrollArea>
            </DaySection>

            <Stack direction="row" justify="between" align="center">
              <Button
                variant="ghost"
                onClick={() => setStep('constraints')}
              >
                <Stack direction="row" spacing="xs" align="center">
                  <RefreshCw size={13} /><span>צור מחדש</span>
                </Stack>
              </Button>
              <Button
                variant="primary"
                onClick={handleCommitDay}
                disabled={approvedCount === 0}
              >
                הוסף ליום ({approvedCount} אירועים)
              </Button>
            </Stack>
          </>
        )}

      </Stack>
    </Modal>
  )
}
