import styled from 'styled-components'
import { Card } from 'myk-library'
import type { TripPlan } from '@/types/trip-plan'
import { formatCurrency } from '@/utils/currency'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { getTotalSpent } from '@/stores/tripStore'

interface Props {
  trip: TripPlan
  todayISO: string
  phase: 'planning' | 'soon' | 'live' | 'done'
}

const Wrap = styled(Card)`
  padding: 14px 16px;
`

const Title = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
`

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`

const Cell = styled.div`
  padding: 10px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
`

const Label = styled.div`
  font-size: 11px;
  color: #8b949e;
  margin-bottom: 4px;
`

const Value = styled.div<{ $color?: string }>`
  font-size: 18px;
  font-weight: 800;
  color: ${({ $color }) => $color ?? '#f0f6fc'};
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
`

const Hint = styled.div`
  margin-top: 8px;
  font-size: 12px;
  color: #8b949e;
  line-height: 1.5;
`

export default function SpendingInsight({ trip, todayISO, phase }: Props) {
  const total = trip.budget.totalBudget
  const currency = trip.budget.currency
  if (total <= 0) return null

  const spent = getTotalSpent(trip)
  const remaining = Math.max(0, total - spent)

  const tripDays = differenceInCalendarDays(parseISO(trip.endDate), parseISO(trip.startDate)) + 1
  let daysLeft = tripDays
  if (phase === 'live') {
    daysLeft = differenceInCalendarDays(parseISO(trip.endDate), parseISO(todayISO)) + 1
  }
  const dailyAvg = daysLeft > 0 ? remaining / daysLeft : 0
  const overBudget = spent > total

  let hint = ''
  if (overBudget) {
    hint = `⚠️ חרגתם מהתקציב ב-${formatCurrency(spent - total, currency)}`
  } else if (phase === 'live') {
    hint = `נשארו ${daysLeft} ימים לטיול · בערך ${formatCurrency(dailyAvg, currency)} ליום`
  } else if (phase === 'planning' || phase === 'soon') {
    hint = `תקציב יומי מתוכנן: ${formatCurrency(total / tripDays, currency)} ליום`
  } else {
    hint = `סה"כ הוצאתם ${formatCurrency(spent, currency)} מתוך ${formatCurrency(total, currency)}`
  }

  return (
    <Wrap variant="outlined">
      <Title>💸 ניתוח תקציב</Title>
      <Row>
        <Cell>
          <Label>נשאר תקציב</Label>
          <Value $color={overBudget ? '#ef4444' : remaining < total * 0.2 ? '#f59e0b' : '#10b981'}>
            {formatCurrency(remaining, currency)}
          </Value>
        </Cell>
        <Cell>
          <Label>{phase === 'done' ? 'סה"כ הוצא' : 'יומי ממוצע'}</Label>
          <Value>
            {phase === 'done'
              ? formatCurrency(spent, currency)
              : formatCurrency(dailyAvg, currency)}
          </Value>
        </Cell>
      </Row>
      <Hint>{hint}</Hint>
    </Wrap>
  )
}
