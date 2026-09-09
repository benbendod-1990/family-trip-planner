import styled from 'styled-components'
import { weatherCodeToEmoji, weatherCodeToLabel } from '@/services/weatherService'
import { useDestinationNowWeather } from '@/hooks/useDestinationNowWeather'
import type { TripCoords } from '@/types/trip-plan'

interface Props {
  destination: string
  coords?: TripCoords
}

const Strip = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  width: 100%;
  margin-top: 4px;
  direction: rtl;
`

const Cell = styled.div`
  background: ${({ theme }) => theme.colors.gray[100]};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 12px;
  padding: 8px 6px 7px;
  text-align: center;
  min-width: 0;
`

const Label = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const Emoji = styled.div`
  font-size: 20px;
  line-height: 1;
  margin: 3px 0;
`

const Temp = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[900]};
  font-variant-numeric: tabular-nums;
`

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gray[500]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

export default function TripWeatherStrip({ destination, coords }: Props) {
  const { weather } = useDestinationNowWeather(destination, coords)
  if (!weather) return null

  const tomorrow = weather.tomorrow

  return (
    <Strip
      title="מזג אוויר ביעד עכשיו ומחר (לא תאריכי הטיול)"
    >
      <Cell>
        <Label>עכשיו</Label>
        <Emoji>{weatherCodeToEmoji(weather.current.weatherCode)}</Emoji>
        <Temp>{weather.current.temp}°</Temp>
        <Hint>{weatherCodeToLabel(weather.current.weatherCode)}</Hint>
      </Cell>
      <Cell>
        <Label>מחר</Label>
        {tomorrow ? (
          <>
            <Emoji>{weatherCodeToEmoji(tomorrow.weatherCode)}</Emoji>
            <Temp>{tomorrow.maxTemp}° / {tomorrow.minTemp}°</Temp>
            <Hint>{weatherCodeToLabel(tomorrow.weatherCode)}</Hint>
          </>
        ) : (
          <>
            <Emoji>{weatherCodeToEmoji(weather.today.weatherCode)}</Emoji>
            <Temp>{weather.today.maxTemp}° / {weather.today.minTemp}°</Temp>
            <Hint>היום</Hint>
          </>
        )}
      </Cell>
    </Strip>
  )
}
