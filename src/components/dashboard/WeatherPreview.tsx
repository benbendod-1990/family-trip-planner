import styled from 'styled-components'
import { Card, Typography } from 'myk-library'
import { useWeather } from '@/hooks/useWeather'
import { weatherCodeToEmoji, weatherCodeToLabel } from '@/services/weatherService'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

interface Props {
  tripId: string
  startDate: string
  endDate: string
}

const Wrap = styled(Card)`
  padding: 16px;
`

const Title = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`

const Caption = styled(Typography)`
  color: #8b949e !important;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  font-size: 12px;
`

const Avg = styled.div`
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
  color: #8b949e;
`

const Strip = styled.div`
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const Day = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  min-width: 56px;
`

const DayName = styled.div`
  font-size: 11px;
  color: #8b949e;
  font-weight: 600;
`

const DayEmoji = styled.div`
  font-size: 22px;
  line-height: 1;
  margin: 4px 0;
`

const Temp = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: #f0f6fc;
  font-variant-numeric: tabular-nums;
`

const TempMin = styled.span`
  color: #8b949e;
  font-weight: 500;
`

const Skel = styled.div`
  height: 92px;
  background: rgba(255,255,255,0.03);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b949e;
  font-size: 13px;
`

export default function WeatherPreview({ tripId, startDate, endDate }: Props) {
  const { weather, loading } = useWeather(tripId)
  const days = Object.values(weather).sort((a, b) => a.date.localeCompare(b.date))

  // determine summary insight
  const insight = (() => {
    if (days.length === 0) return null
    const rainyDays = days.filter(d => d.precipitation > 1).length
    const avgMax = Math.round(days.reduce((s, d) => s + d.maxTemp, 0) / days.length)
    const avgMin = Math.round(days.reduce((s, d) => s + d.minTemp, 0) / days.length)
    const rainNote = rainyDays > 0 ? ` · 🌧 ${rainyDays} ימים גשומים` : ''
    return `ממוצע ${avgMax}° / ${avgMin}°${rainNote}`
  })()

  const showWeather = (() => {
    // Open-Meteo only has reliable forecast ~16 days ahead
    const daysToStart = Math.ceil((new Date(startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return daysToStart <= 16 && new Date(endDate).getTime() >= Date.now()
  })()

  if (!showWeather) return null

  return (
    <Wrap variant="outlined">
      <Title>
        <Caption>🌤 מזג אוויר ביעד</Caption>
        {insight && <Avg>{insight}</Avg>}
      </Title>
      {loading && days.length === 0 ? (
        <Skel>טוען תחזית…</Skel>
      ) : days.length === 0 ? (
        <Skel>תחזית לא זמינה כרגע</Skel>
      ) : (
        <Strip>
          {days.slice(0, 8).map(d => (
            <Day key={d.date} title={weatherCodeToLabel(d.weatherCode)}>
              <DayName>{format(parseISO(d.date), 'EEE', { locale: he })}</DayName>
              <DayEmoji>{weatherCodeToEmoji(d.weatherCode)}</DayEmoji>
              <Temp>
                {d.maxTemp}° <TempMin>/ {d.minTemp}°</TempMin>
              </Temp>
            </Day>
          ))}
        </Strip>
      )}
    </Wrap>
  )
}
