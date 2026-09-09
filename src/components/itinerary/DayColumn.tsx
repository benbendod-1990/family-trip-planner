import { useState } from 'react'
import { Card, Badge, Stack, ActionIcon, Button, Typography } from 'myk-library'
import { useTripStore } from '@/stores/tripStore'
import { formatDateHe } from '@/utils/date'
import { sortDayEvents } from '@/utils/itineraryLayout'
import type { TripDay, TripEvent } from '@/types/trip'
import EventFormModal from './EventFormModal'
import WeatherBadge from './WeatherBadge'
import { Plus, Pencil, Trash2, Navigation } from 'lucide-react'
import styled from 'styled-components'
import type { DayWeather } from '@/services/weatherService'
import { wazeUrl, googleMapsUrl, googleMapsRouteUrl, routeStopsForDay } from '@/utils/maps'

const CATEGORY_COLORS: Record<string, string> = {
  activity: '#f59e0b',
  meal: '#10b981',
  transport: '#3b82f6',
  tour: '#8b5cf6',
  rest: '#6b7280',
  other: '#6b7280',
}

const CATEGORY_LABEL: Record<string, string> = {
  activity: '🎯 פעילות',
  meal: '🍽️ ארוחה',
  transport: '🚌 תחבורה',
  tour: '🗺️ סיור',
  rest: '😴 מנוחה',
  other: '📌 אחר',
}

const DayWrapper = styled.div`
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
`

/*
 * Local event list instead of myk-library Timeline. Timeline is a deep tree of
 * styled wrappers per item (dot, rail, label, body). 15 USA days × that tree
 * is how iPhone can throw inside PageErrorBoundary while Chromium still paints:
 * WebKit's smaller stack + Timeline's min-content rows. A shallow list cannot.
 */
const EventList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
`

const EventItem = styled.li<{ $color: string }>`
  min-width: 0;
  padding-inline-start: 12px;
  border-inline-start: 3px solid ${({ $color }) => $color};
`

const EventTime = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: #6e5c42;
  margin-bottom: 4px;
`

const EventTitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
`

const EventTitle = styled.div`
  font-weight: 500;
  min-width: 0;
  overflow-wrap: anywhere;
`

const EventActions = styled.div`
  display: flex;
  flex-shrink: 0;
  gap: 4px;
`

const EventMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
`

const MapLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #2563eb;
  font-size: 13px;
  text-decoration: none;
`

interface Props {
  day: TripDay
  tripId: string
  dayIndex: number
  weather?: DayWeather
}

export default function DayColumn({ day, tripId, dayIndex, weather }: Props) {
  const removeEvent = useTripStore(s => s.removeEvent)
  const [showAdd, setShowAdd] = useState(false)
  const [editEvent, setEditEvent] = useState<TripEvent | undefined>()

  const sortedEvents = sortDayEvents(day.events)
  const routeStops = routeStopsForDay(sortedEvents)
  const dayRouteUrl = googleMapsRouteUrl(routeStops)
  const routeStopCount = routeStops.length

  return (
    <DayWrapper>
      <Card variant="outlined" padding="md">
        <Stack direction="column" spacing="md">
          <Stack direction="column" spacing="xs">
            <Typography variant="body2" style={{ color: '#6b7280', fontSize: 12, fontWeight: 600 }}>יום {dayIndex + 1}</Typography>
            <Typography variant="body1" style={{ fontWeight: 600 }}>{formatDateHe(day.date)}</Typography>
            {weather && <WeatherBadge data={weather} />}
            {routeStopCount >= 2 && (
              <a
                href={dayRouteUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="מסלול אחד דרך כל עצירות היום"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                  background: '#4285f4', color: '#fff', fontSize: 13, fontWeight: 600,
                  padding: '6px 12px', borderRadius: 999, textDecoration: 'none', marginTop: 2,
                }}
              >
                🗺️ מסלול היום בגוגל מפות
              </a>
            )}
          </Stack>

          {sortedEvents.length > 0 ? (
            <EventList>
              {sortedEvents.map(event => {
                const color = CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other
                const timeLabel = event.startTime
                  ? event.startTime + (event.endTime ? ` – ${event.endTime}` : '')
                  : (event.endTime ?? '')
                const cost = typeof event.cost === 'number' ? event.cost : undefined
                return (
                  <EventItem key={event.id} $color={color}>
                    {timeLabel && <EventTime>{timeLabel}</EventTime>}
                    <EventTitleRow>
                      <EventTitle>{event.title}</EventTitle>
                      <EventActions>
                        <ActionIcon size="sm" variant="subtle" onClick={() => setEditEvent(event)}>
                          <Pencil size={12} />
                        </ActionIcon>
                        <ActionIcon size="sm" variant="subtle" onClick={() => removeEvent(tripId, event.id)}>
                          <Trash2 size={12} />
                        </ActionIcon>
                      </EventActions>
                    </EventTitleRow>
                    <EventMeta>
                      <Badge size="sm" variant="default">{CATEGORY_LABEL[event.category] ?? CATEGORY_LABEL.other}</Badge>
                      {event.location && (
                        <>
                          <Typography variant="body2" style={{ color: '#6b7280' }}>📍 {event.location}</Typography>
                          <MapLink
                            href={googleMapsUrl(event.location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`נווט ל-${event.location} ב-Google Maps`}
                          >
                            <Navigation size={13} />
                            <span>Google Maps</span>
                          </MapLink>
                          <MapLink
                            href={wazeUrl(event.location)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`נווט ל-${event.location} ב-Waze`}
                          >
                            <Navigation size={13} />
                            <span>Waze</span>
                          </MapLink>
                        </>
                      )}
                      {cost !== undefined && (
                        <Typography variant="body2" style={{ color: '#059669' }}>₪{cost.toLocaleString()}</Typography>
                      )}
                    </EventMeta>
                  </EventItem>
                )
              })}
            </EventList>
          ) : (
            <Typography variant="body2" style={{ color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>
              אין אירועים מתוכננים
            </Typography>
          )}

          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)} style={{ width: '100%' }}>
            <Stack direction="row" spacing="xs" align="center" justify="center">
              <Plus size={14} />
              <span>הוסף אירוע</span>
            </Stack>
          </Button>
        </Stack>
      </Card>

      {showAdd && (
        <EventFormModal
          open={showAdd}
          onClose={() => setShowAdd(false)}
          tripId={tripId}
          dayDate={day.date}
        />
      )}
      {editEvent && (
        <EventFormModal
          open={!!editEvent}
          onClose={() => setEditEvent(undefined)}
          tripId={tripId}
          dayDate={day.date}
          editEvent={editEvent}
        />
      )}
    </DayWrapper>
  )
}
