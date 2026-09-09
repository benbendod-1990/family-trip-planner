import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useWeather } from '@/hooks/useWeather'
import DayColumn from '@/components/itinerary/DayColumn'
import GmailSyncInlineButton from '@/components/gmail/GmailSyncInlineButton'
import { Stack, Typography, Badge } from 'myk-library'
import { getTripDuration, formatDateShort } from '@/utils/date'
import {
  itineraryGridColumns,
  itineraryDaysTemplate,
  itineraryIsSingleColumn,
} from '@/utils/itineraryLayout'
import { History } from 'lucide-react'
import styled, { css } from 'styled-components'
import { useDestinationCacheStore } from '@/stores/destinationCacheStore'

const GridWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
`

/*
 * myk-library Grid uses `repeat(N, 1fr)` = minmax(auto, 1fr). That auto
 * minimum is min-content; 15 Timeline columns against overflow-x:hidden is
 * how iOS Safari paints a cream blank instead of the itinerary. A flex
 * stack on one column, minmax(0, 1fr) otherwise, cannot blow out.
 */
const DaysGrid = styled.div<{ $cols: number }>`
  width: 100%;
  min-width: 0;
  max-width: 100%;
  gap: 16px;
  ${({ $cols }) => itineraryIsSingleColumn($cols)
    ? css`
        display: flex;
        flex-direction: column;
      `
    : css`
        display: grid;
        grid-template-columns: ${itineraryDaysTemplate($cols)};
        align-items: start;
      `}
`

const PageHeader = styled.div<{ $mobile: boolean }>`
  padding: 20px ${({ $mobile }) => ($mobile ? '12px' : '24px')} 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const PageHeaderRow = styled.div<{ $mobile: boolean }>`
  display: flex;
  align-items: ${({ $mobile }) => ($mobile ? 'flex-start' : 'center')};
  justify-content: space-between;
  flex-direction: ${({ $mobile }) => ($mobile ? 'column' : 'row')};
  gap: ${({ $mobile }) => ($mobile ? '8px' : '0')};
`

export default function Itinerary() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))

  const { isMobile, isTablet } = useBreakpoint()
  const { weather } = useWeather(id ?? '')
  const getDestination = useDestinationCacheStore(s => s.getDestination)
  const [hidePastVisit, setHidePastVisit] = useState(false)

  if (!trip) return null

  const duration = getTripDuration(trip.startDate, trip.endDate)
  const columns = itineraryGridColumns(isMobile, isTablet)
  const destMemory = getDestination(trip.destination)
  const pastVisits = destMemory?.visits.filter(v => v.tripId !== id) ?? []

  return (
    <div>
      <PageHeader $mobile={isMobile}>
        <PageHeaderRow $mobile={isMobile}>
          <Stack direction="row" align="center" spacing="sm" style={{ flexWrap: 'wrap' }}>
            <Typography variant="h5" style={{ margin: 0 }}>📅 לוח זמנים</Typography>
            <Badge variant="default">{duration} ימים</Badge>
            <Typography variant="body2" style={{ color: '#6b7280' }}>
              {formatDateShort(trip.startDate)} – {formatDateShort(trip.endDate)}
            </Typography>
          </Stack>
          <Stack direction="row" spacing="sm">
            <GmailSyncInlineButton />
          </Stack>
        </PageHeaderRow>
      </PageHeader>

      {pastVisits.length > 0 && !hidePastVisit && (
        <div style={{ margin: `12px ${isMobile ? '12px' : '24px'} 0`, background: 'rgba(59,130,246,0.12)', border: '1.5px solid #3b82f6', borderRadius: 10, padding: '10px 14px' }}>
          <Stack direction="row" align="center" justify="between">
            <Stack direction="row" spacing="sm" align="center">
              <History size={16} style={{ color: '#60a5fa' }} />
              <Typography variant="body2" style={{ fontWeight: 700, color: '#93c5fd' }}>
                ביקרתם ב-{trip.destination} לפני כן!
              </Typography>
            </Stack>
            <button onClick={() => setHidePastVisit(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#60a5fa', fontSize: 18 }}>×</button>
          </Stack>
          {pastVisits.slice(0, 2).map(v => (
            <div key={v.tripId} style={{ marginTop: 8 }}>
              <Typography variant="body2" style={{ color: '#93c5fd', fontSize: 12 }}>
                {v.coverEmoji} <strong>{v.tripName}</strong> ({formatDateShort(v.startDate)} – {formatDateShort(v.endDate)})
                {v.overallRating > 0 && ` · ${'⭐'.repeat(v.overallRating)}`}
              </Typography>
              {v.highlights.length > 0 && (
                <Typography variant="body2" style={{ color: '#60a5fa', fontSize: 11, marginTop: 2 }}>
                  💡 {v.highlights.slice(0, 2).join(' · ')}
                </Typography>
              )}
              {v.whatWentWell && (
                <Typography variant="body2" style={{ color: '#60a5fa', fontSize: 11, marginTop: 2 }}>
                  ✓ {v.whatWentWell.substring(0, 80)}{v.whatWentWell.length > 80 ? '...' : ''}
                </Typography>
              )}
            </div>
          ))}
        </div>
      )}

      <GridWrapper $mobile={isMobile}>
        <DaysGrid $cols={columns}>
          {trip.days.map((day, index) => (
            <DayColumn key={day.id} day={day} tripId={trip.id} dayIndex={index} weather={weather[day.date]} />
          ))}
        </DaysGrid>
      </GridWrapper>
    </div>
  )
}
