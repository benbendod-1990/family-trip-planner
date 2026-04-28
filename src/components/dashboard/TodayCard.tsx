import styled from 'styled-components'
import { Card } from 'myk-library'
import { useNavigate } from 'react-router-dom'
import type { TripPlan } from '@/types/trip-plan'
import type { TripEvent } from '@/types/trip'
import { useWeather } from '@/hooks/useWeather'
import { weatherCodeToEmoji, weatherCodeToLabel } from '@/services/weatherService'
import { formatDateShort } from '@/utils/date'

interface Props {
  trip: TripPlan
  todayISO: string
}

const Wrap = styled(Card)`
  padding: 16px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
`

const Title = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #10b981;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const WeatherPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 999px;
  font-size: 12px;
  color: #f0f6fc;
`

const Now = styled.div`
  padding: 12px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.04));
  border: 1px solid rgba(16,185,129,0.35);
  margin-bottom: 8px;
`

const NowTag = styled.div`
  font-size: 11px;
  color: #10b981;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 4px;
`

const EventTitle = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: #f0f6fc;
  margin-bottom: 4px;
`

const EventMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 12px;
  color: #8b949e;
`

const NextRow = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  width: 100%;
  text-align: right;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  min-height: 44px;
  transition: background 120ms ease;
  &:hover { background: rgba(255,255,255,0.06); }
  & + & { margin-top: 6px; }
`

const Time = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: #f59e0b;
  min-width: 44px;
  font-variant-numeric: tabular-nums;
`

const Title2 = styled.span`
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Empty = styled.div`
  text-align: center;
  padding: 12px;
  color: #8b949e;
  font-size: 13px;
`

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export default function TodayCard({ trip, todayISO }: Props) {
  const navigate = useNavigate()
  const { weather } = useWeather(trip.id)
  const todayWeather = weather[todayISO]

  const todayDay = trip.days.find(d => d.date === todayISO)
  const events = (todayDay?.events ?? []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime))
  const now = nowMinutes()

  const ongoing: TripEvent | undefined = events.find(e => {
    const start = toMinutes(e.startTime)
    const end = e.endTime ? toMinutes(e.endTime) : start + 60
    return start <= now && now < end
  })
  const next = events.find(e => toMinutes(e.startTime) > now)
  const upcoming = events.filter(e => toMinutes(e.startTime) > (next ? toMinutes(next.startTime) : now)).slice(0, 2)

  return (
    <Wrap variant="outlined">
      <Header>
        <Title>📍 היום · {formatDateShort(todayISO)}</Title>
        {todayWeather && (
          <WeatherPill title={weatherCodeToLabel(todayWeather.weatherCode)}>
            <span>{weatherCodeToEmoji(todayWeather.weatherCode)}</span>
            <span>{todayWeather.maxTemp}° / {todayWeather.minTemp}°</span>
          </WeatherPill>
        )}
      </Header>

      {ongoing ? (
        <Now>
          <NowTag>● עכשיו</NowTag>
          <EventTitle>{ongoing.title}</EventTitle>
          <EventMeta>
            <span>🕐 {ongoing.startTime}{ongoing.endTime ? ` – ${ongoing.endTime}` : ''}</span>
            {ongoing.location && <span>📍 {ongoing.location}</span>}
          </EventMeta>
        </Now>
      ) : next ? (
        <Now>
          <NowTag>⏭ הבא בתור</NowTag>
          <EventTitle>{next.title}</EventTitle>
          <EventMeta>
            <span>🕐 {next.startTime}{next.endTime ? ` – ${next.endTime}` : ''}</span>
            {next.location && <span>📍 {next.location}</span>}
          </EventMeta>
        </Now>
      ) : events.length === 0 ? (
        <Empty>אין אירועים מתוכננים להיום</Empty>
      ) : (
        <Empty>סיימתם את היום 🌙</Empty>
      )}

      {upcoming.map(e => (
        <NextRow key={e.id} onClick={() => navigate(`/trip/${trip.id}/itinerary`)}>
          <Time>{e.startTime}</Time>
          <Title2>{e.title}</Title2>
        </NextRow>
      ))}
    </Wrap>
  )
}
