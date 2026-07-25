import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Stack, Typography, Badge } from 'myk-library'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { wazeUrl, googleMapsUrl, googleMapsRouteUrl } from '@/utils/maps'
import { formatDateShort } from '@/utils/date'
import { warmDisplayFont } from '@/theme/warmTheme'

function eventEmoji(category?: string): string {
  switch (category) {
    case 'meal': return '🍽️'
    case 'transport': return '🚗'
    case 'rest': return '😴'
    case 'tour': return '🗺️'
    default: return '📍'
  }
}

interface Stop {
  id: string
  title: string
  location: string
  startTime?: string
  emoji: string
}

interface DayGroup {
  id: string
  date: string
  label?: string
  color: string
  stops: Stop[]
}

const DAY_PALETTE = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#d946ef', '#eab308', '#0ea5e9',
]

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
`

const Header = styled.div<{ $mobile: boolean }>`
  padding: 12px ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray[200]};
  flex-shrink: 0;
`

const ScrollBody = styled.div<{ $mobile: boolean }>`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${({ $mobile }) => ($mobile ? '12px' : '20px 24px')};
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
  width: 100%;
  margin-inline: auto;
`

const Section = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 14px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
  /* In the flex-column scroll body, keep each card at its content height
     instead of letting flex shrink + overflow:hidden clip the rows. */
  flex-shrink: 0;
`

const DayHead = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-inline-start: 5px solid ${({ $color }) => $color};
  background: ${({ theme }) => theme.colors.gray[50]};
`

const DayTitle = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 18px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const RouteLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #4285f4;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 13px;
  border-radius: 999px;
  text-decoration: none;
  white-space: nowrap;
  margin-inline-start: auto;
  &:hover { background: #3367d6; }
`

const StopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid ${({ theme }) => theme.colors.gray[100]};
`

const StopInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const StopTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const StopMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.gray[500]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const MiniLink = styled.a<{ $bg: string }>`
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 6px;
  background: ${({ $bg }) => $bg};
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  &:hover { filter: brightness(0.93); }
`

const EmptyBox = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  opacity: 0.7;
  padding: 40px 16px;
`

export default function Map() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()

  const days = useMemo<DayGroup[]>(() => {
    if (!trip) return []
    const sortedDates = trip.days.map(d => d.date).sort()
    const colorFor = (date: string) => DAY_PALETTE[sortedDates.indexOf(date) % DAY_PALETTE.length]
    return trip.days
      .map(day => {
        const stops = day.events
          .filter(ev => ev.location)
          .slice()
          .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
          .map(ev => ({
            id: ev.id,
            title: ev.title,
            location: ev.location as string,
            startTime: ev.startTime,
            emoji: eventEmoji(ev.category),
          }))
        return {
          id: day.id,
          date: day.date,
          label: day.label,
          color: colorFor(day.date),
          stops,
        }
      })
      .filter(d => d.stops.length > 0)
  }, [trip])

  const accommodations = useMemo(
    () => (trip?.accommodations ?? []).filter(a => a.address),
    [trip]
  )

  if (!trip) return null

  const totalStops = days.reduce((n, d) => n + d.stops.length, 0)

  return (
    <PageWrapper>
      <Header $mobile={isMobile}>
        <Stack direction="row" align="center" spacing="sm" style={{ flexWrap: 'wrap' }}>
          <Typography variant="h5" style={{ margin: 0 }}>🗺️ מפה</Typography>
          <Badge variant="info" size="sm">{trip.destination}</Badge>
          {accommodations.length > 0 && (
            <Badge size="sm">🏨 {accommodations.length} לינות</Badge>
          )}
          <Badge size="sm">📍 {totalStops} מקומות</Badge>
        </Stack>
        <Typography variant="caption" style={{ opacity: 0.7, display: 'block', marginTop: 6 }}>
          כל יום כמסלול אחד ב-Google Maps, וכל מקום בנפרד לניווט
        </Typography>
      </Header>

      <ScrollBody $mobile={isMobile}>
        {accommodations.length > 0 && (
          <Section>
            <DayHead $color="#7c3aed">
              <span style={{ fontSize: 20 }}>🏨</span>
              <DayTitle>לינות</DayTitle>
            </DayHead>
            {accommodations.map(acc => (
              <StopRow key={acc.id}>
                <StopInfo>
                  <StopTitle>{acc.name}</StopTitle>
                  <StopMeta>📍 {acc.address}</StopMeta>
                </StopInfo>
                <MiniLink $bg="#4285f4" href={googleMapsUrl(acc.address as string)} target="_blank" rel="noopener noreferrer">Google Maps</MiniLink>
                <MiniLink $bg="#33ccff" href={wazeUrl(acc.address as string)} target="_blank" rel="noopener noreferrer">Waze</MiniLink>
              </StopRow>
            ))}
          </Section>
        )}

        {days.length === 0 ? (
          <EmptyBox>
            <Typography variant="body2">
              אין עדיין פעילויות עם מיקום. הוסיפו מקומות בלו״ז והם יופיעו כאן כמסלולים לפתיחה בגוגל מפות.
            </Typography>
          </EmptyBox>
        ) : (
          days.map(day => (
            <Section key={day.id}>
              <DayHead $color={day.color}>
                <DayTitle>
                  {formatDateShort(day.date)}{day.label ? ` · ${day.label}` : ''}
                </DayTitle>
                {day.stops.length >= 2 && (
                  <RouteLink
                    href={googleMapsRouteUrl(day.stops.map(s => s.location))}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="מסלול אחד דרך כל עצירות היום"
                  >
                    🗺️ מסלול היום בגוגל מפות
                  </RouteLink>
                )}
              </DayHead>
              {day.stops.map(stop => (
                <StopRow key={stop.id}>
                  <span style={{ fontSize: 18 }}>{stop.emoji}</span>
                  <StopInfo>
                    <StopTitle>
                      {stop.startTime ? `${stop.startTime} · ` : ''}{stop.title}
                    </StopTitle>
                    <StopMeta>📍 {stop.location}</StopMeta>
                  </StopInfo>
                  <MiniLink $bg="#4285f4" href={googleMapsUrl(stop.location)} target="_blank" rel="noopener noreferrer">Google Maps</MiniLink>
                  <MiniLink $bg="#33ccff" href={wazeUrl(stop.location)} target="_blank" rel="noopener noreferrer">Waze</MiniLink>
                </StopRow>
              ))}
            </Section>
          ))
        )}
      </ScrollBody>
    </PageWrapper>
  )
}
