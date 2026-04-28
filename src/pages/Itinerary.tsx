import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useWeather } from '@/hooks/useWeather'
import DayColumn from '@/components/itinerary/DayColumn'
import SmartAddBar from '@/components/itinerary/SmartAddBar'
import GmailSyncModal from '@/components/gmail/GmailSyncModal'
import AiItineraryModal from '@/components/ai/AiItineraryModal'
import { Stack, Typography, Badge, Button, Grid } from 'myk-library'
import { getTripDuration } from '@/utils/date'
import { formatDateShort } from '@/utils/date'
import { Mail, History, Sparkles } from 'lucide-react'
import styled from 'styled-components'
import { useDestinationCacheStore } from '@/stores/destinationCacheStore'

const GridWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  min-height: calc(100vh - 120px);
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
  const [showGmail, setShowGmail] = useState(false)
  const [showAiBuilder, setShowAiBuilder] = useState(false)

  const { isMobile } = useBreakpoint()
  const { weather } = useWeather(id ?? '')
  const getDestination = useDestinationCacheStore(s => s.getDestination)
  const [hidePastVisit, setHidePastVisit] = useState(false)

  if (!trip) return null

  const duration = getTripDuration(trip.startDate, trip.endDate)
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
            <Button size="sm" variant="primary" onClick={() => setShowAiBuilder(true)}>
              <Stack direction="row" spacing="xs" align="center">
                <Sparkles size={14} /><span>בנה לי מסלול עם AI</span>
              </Stack>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowGmail(true)}>
              <Stack direction="row" spacing="xs" align="center">
                <Mail size={14} /><span>סנכרן מ-Gmail</span>
              </Stack>
            </Button>
          </Stack>
        </PageHeaderRow>
      </PageHeader>
      {showGmail && <GmailSyncModal open={showGmail} onClose={() => setShowGmail(false)} tripId={trip.id} />}
      {showAiBuilder && (
        <AiItineraryModal open={showAiBuilder} onClose={() => setShowAiBuilder(false)} tripId={trip.id} />
      )}

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

      <div style={{ padding: `12px ${isMobile ? '12px' : '24px'} 0` }}>
        <SmartAddBar trip={trip} />
      </div>

      <GridWrapper $mobile={isMobile}>
        <Grid columns="repeat(auto-fit, minmax(280px, 1fr))" gap="md" autoFlow="row">
          {trip.days.map((day, index) => (
            <DayColumn key={day.id} day={day} tripId={trip.id} dayIndex={index} weather={weather[day.date]} />
          ))}
        </Grid>
      </GridWrapper>
    </div>
  )
}
