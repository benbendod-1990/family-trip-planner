import { useMemo } from 'react'
import styled from 'styled-components'
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  parseISO,
  startOfMonth,
} from 'date-fns'
import { he } from 'date-fns/locale'
import type { TripDay } from '@/types/trip'
import { collectDayStops } from '@/lib/tripMapDayStops'
import type { TripMapPoi } from '@/lib/tripMapPois'

interface Props {
  startDate: string
  endDate: string
  days: TripDay[]
  pois: TripMapPoi[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

const Wrap = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  @media (min-width: 640px) {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px dashed ${({ theme }) => theme.colors.gray[300]};
  border-radius: 14px;
  padding: 10px 12px 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const MonthTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
  color: ${({ theme }) => theme.colors.gray[800]};
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  text-align: center;
`

const Dow = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.gray[500]};
  padding: 2px 0;
`

const Cell = styled.button<{ $on: boolean; $active: boolean }>`
  border: none;
  background: ${({ $on, $active, theme }) =>
    $active ? theme.colors.primary[200] : $on ? theme.colors.primary[50] : 'transparent'};
  color: ${({ theme }) => theme.colors.gray[900]};
  border-radius: 999px;
  min-height: 28px;
  font-size: 11px;
  font-family: inherit;
  cursor: ${({ $on }) => ($on ? 'pointer' : 'default')};
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
  padding: 2px 0;
`

const HEB_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function monthsCovered(start: string, end: string): Date[] {
  const a = startOfMonth(parseISO(start))
  const b = startOfMonth(parseISO(end))
  const out: Date[] = []
  const cur = new Date(a)
  while (cur <= b) {
    out.push(new Date(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  return out.slice(0, 3)
}

export default function MiniTripCalendars({
  startDate,
  endDate,
  days,
  pois,
  selectedDate,
  onSelectDate,
}: Props) {
  const byDate = useMemo(() => {
    const map = new Map<string, { emoji: string }>()
    for (const day of days) {
      const stops = collectDayStops(day, pois)
      map.set(day.date, { emoji: stops[0]?.emoji ?? '•' })
    }
    return map
  }, [days, pois])

  const months = monthsCovered(startDate, endDate)

  return (
    <Wrap>
      {months.map(month => {
        const start = startOfMonth(month)
        const end = endOfMonth(month)
        const lead = getDay(start)
        const cells = eachDayOfInterval({ start, end })
        return (
          <Card key={month.toISOString()}>
            <MonthTitle>{format(month, 'LLLL yyyy', { locale: he })}</MonthTitle>
            <Grid>
              {HEB_DOW.map(d => <Dow key={d}>{d}</Dow>)}
              {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
              {cells.map(d => {
                const iso = format(d, 'yyyy-MM-dd')
                const hit = byDate.get(iso)
                return (
                  <Cell
                    key={iso}
                    type="button"
                    $on={Boolean(hit)}
                    $active={iso === selectedDate}
                    disabled={!hit}
                    onClick={() => hit && onSelectDate(iso)}
                  >
                    <span>{d.getDate()}</span>
                    {hit && <span style={{ fontSize: 10 }}>{hit.emoji}</span>}
                  </Cell>
                )
              })}
            </Grid>
          </Card>
        )
      })}
    </Wrap>
  )
}
