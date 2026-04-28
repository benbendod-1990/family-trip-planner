import { useState } from 'react'
import { Stack, Button, Typography, Badge, Input, Select, Textarea } from 'myk-library'
import styled from 'styled-components'
import { Sparkles, MapPin, Clock, Calendar, X, Pencil, Check } from 'lucide-react'
import { useTripStore } from '@/stores/tripStore'
import type { TripPlan, TripCoords } from '@/types/trip-plan'
import type { TripEventCategory } from '@/types/trip'
import { parseItineraryText, type ParsedEvent } from '@/lib/aiClient'
import { formatDateHe } from '@/utils/date'

const Wrapper = styled.div`
  border: 1.5px dashed ${({ theme }) => theme.colors.primary[300] ?? '#93c5fd'};
  border-radius: 12px;
  padding: 14px;
  background: linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04));
`

const TextBox = styled.textarea`
  width: 100%;
  min-height: 56px;
  border: 1px solid ${({ theme }) => theme.colors.gray[300]};
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  background: white;
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary[500] ?? '#3b82f6'}; }
`

const PreviewCard = styled.div`
  background: white;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #4b5563;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 2px 8px;
`

const CATEGORY_OPTIONS: { value: TripEventCategory; label: string }[] = [
  { value: 'activity', label: '🎯 פעילות' },
  { value: 'meal', label: '🍽️ ארוחה' },
  { value: 'transport', label: '🚌 תחבורה' },
  { value: 'tour', label: '🗺️ סיור' },
  { value: 'rest', label: '😴 מנוחה' },
]

interface Props {
  trip: TripPlan
  pinnedLocation?: { name?: string; address?: string; coords?: TripCoords } | null
  initialText?: string
  onCancel?: () => void
  onAdded?: () => void
  compact?: boolean
}

export default function SmartAddBar({ trip, pinnedLocation, initialText, onCancel, onAdded, compact }: Props) {
  const addEvent = useTripStore(s => s.addEvent)
  const [text, setText] = useState(initialText ?? '')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ParsedEvent[] | null>(null)
  const [notes, setNotes] = useState<string | undefined>()
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  async function handleParse() {
    if (!text.trim() || parsing) return
    setParsing(true)
    setError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await parseItineraryText({
        text: text.trim(),
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        today,
        pinnedLocation: pinnedLocation
          ? { name: pinnedLocation.name, address: pinnedLocation.address }
          : undefined,
      })
      if (!res.events?.length) {
        setError('לא הצלחתי לפענח אירוע מהטקסט. נסה לכתוב יותר מפורש.')
      } else {
        // If user pinned a location on the map, override AI's location with it.
        const drafts = pinnedLocation?.address
          ? res.events.map(e => ({ ...e, location: pinnedLocation.address }))
          : res.events
        setDrafts(drafts)
        setNotes(res.notes && res.notes.trim() ? res.notes : undefined)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  function handleConfirm() {
    if (!drafts) return
    for (const d of drafts) {
      addEvent(trip.id, d.date, {
        title: d.title,
        startTime: d.startTime,
        endTime: d.endTime,
        category: d.category,
        location: d.location,
        description: d.description,
        cost: d.cost,
      })
    }
    setText('')
    setDrafts(null)
    setNotes(undefined)
    setEditingIdx(null)
    onAdded?.()
  }

  function handleReject() {
    setDrafts(null)
    setNotes(undefined)
    setEditingIdx(null)
  }

  function patchDraft(idx: number, patch: Partial<ParsedEvent>) {
    setDrafts(curr => (curr ? curr.map((d, i) => (i === idx ? { ...d, ...patch } : d)) : curr))
  }

  function removeDraft(idx: number) {
    setDrafts(curr => {
      if (!curr) return curr
      const next = curr.filter((_, i) => i !== idx)
      return next.length ? next : null
    })
    if (editingIdx === idx) setEditingIdx(null)
  }

  return (
    <Wrapper>
      <Stack direction="column" spacing="sm">
        {!compact && (
          <Stack direction="row" align="center" spacing="xs">
            <Sparkles size={16} style={{ color: '#8b5cf6' }} />
            <Typography variant="body2" style={{ fontWeight: 600 }}>
              הוספה חופשית — תאר מה, מתי ואיפה
            </Typography>
            {pinnedLocation?.name && (
              <Badge variant="info" size="sm">📍 {pinnedLocation.name}</Badge>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                aria-label="סגור"
                style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={16} />
              </button>
            )}
          </Stack>
        )}

        {!drafts && (
          <>
            <TextBox
              dir="rtl"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={
                pinnedLocation?.name
                  ? `מתי וכמה זמן? למשל: "מחר ב-10 בבוקר"`
                  : `למשל: "מחר ב-10 ביקור באנה פרנק האוס" או "ביום שני ארוחת ערב במלון"`
              }
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleParse()
                }
              }}
            />
            <Stack direction="row" spacing="sm" align="center" justify="between">
              <Typography variant="caption" style={{ color: '#6b7280' }}>
                {trip.startDate} – {trip.endDate} · ⌘+Enter לשליחה
              </Typography>
              <Button
                variant="primary"
                size="sm"
                onClick={handleParse}
                disabled={!text.trim() || parsing}
              >
                {parsing ? '⏳ מפענח…' : '✨ הוסף ללוז'}
              </Button>
            </Stack>
            {error && (
              <Typography variant="caption" style={{ color: '#ef4444' }}>
                {error}
              </Typography>
            )}
          </>
        )}

        {drafts && (
          <>
            {notes && (
              <Typography variant="caption" style={{ color: '#6b7280' }}>
                💡 {notes}
              </Typography>
            )}
            {drafts.map((d, idx) =>
              editingIdx === idx ? (
                <PreviewCard key={idx}>
                  <Input
                    label="כותרת"
                    value={d.title}
                    onChange={e => patchDraft(idx, { title: e.target.value })}
                  />
                  <Stack direction="row" spacing="sm">
                    <Input
                      type="date"
                      label="תאריך"
                      value={d.date}
                      min={trip.startDate}
                      max={trip.endDate}
                      onChange={e => patchDraft(idx, { date: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <Input
                      type="time"
                      label="התחלה"
                      value={d.startTime}
                      onChange={e => patchDraft(idx, { startTime: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <Input
                      type="time"
                      label="סיום"
                      value={d.endTime ?? ''}
                      onChange={e => patchDraft(idx, { endTime: e.target.value || undefined })}
                      style={{ flex: 1 }}
                    />
                  </Stack>
                  <Select
                    label="קטגוריה"
                    value={d.category}
                    onChange={e => patchDraft(idx, { category: e.target.value as TripEventCategory })}
                  >
                    {CATEGORY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                  <Input
                    label="מיקום"
                    value={d.location ?? ''}
                    placeholder="כתובת או שם מקום"
                    onChange={e => patchDraft(idx, { location: e.target.value || undefined })}
                  />
                  <Textarea
                    label="פרטים"
                    value={d.description ?? ''}
                    onChange={e => patchDraft(idx, { description: e.target.value || undefined })}
                    resize="vertical"
                  />
                  <Stack direction="row" justify="end" spacing="xs">
                    <Button size="sm" variant="ghost" onClick={() => setEditingIdx(null)}>
                      <Check size={14} /> סיום עריכה
                    </Button>
                  </Stack>
                </PreviewCard>
              ) : (
                <PreviewCard key={idx}>
                  <Stack direction="row" align="center" justify="between">
                    <Typography variant="body1" style={{ fontWeight: 600 }}>
                      {d.title}
                    </Typography>
                    <Stack direction="row" spacing="xs">
                      {typeof d.confidence === 'number' && d.confidence < 0.7 && (
                        <Badge size="sm" variant="warning">לא בטוח</Badge>
                      )}
                      <button
                        onClick={() => setEditingIdx(idx)}
                        aria-label="ערוך"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => removeDraft(idx)}
                        aria-label="הסר"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                      >
                        <X size={14} />
                      </button>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing="xs" align="center" style={{ flexWrap: 'wrap' }}>
                    <Pill><Calendar size={11} /> {formatDateHe(d.date)}</Pill>
                    <Pill><Clock size={11} /> {d.startTime}{d.endTime ? `–${d.endTime}` : ''}</Pill>
                    {d.location && <Pill><MapPin size={11} /> {d.location}</Pill>}
                    <Badge size="sm" variant="default">
                      {CATEGORY_OPTIONS.find(o => o.value === d.category)?.label ?? d.category}
                    </Badge>
                  </Stack>
                  {d.description && (
                    <Typography variant="caption" style={{ color: '#6b7280' }}>
                      {d.description}
                    </Typography>
                  )}
                </PreviewCard>
              )
            )}
            <Stack direction="row" justify="end" spacing="sm">
              <Button variant="ghost" size="sm" onClick={handleReject}>
                ביטול
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirm}>
                ✓ אשר והוסף ללוז ({drafts.length})
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Wrapper>
  )
}
