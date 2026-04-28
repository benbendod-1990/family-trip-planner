import styled from 'styled-components'
import { Card, Typography } from 'myk-library'
import type { TripPlan } from '@/types/trip-plan'
import { getTripDuration } from '@/utils/date'

interface Props {
  trip: TripPlan
}

interface Check {
  label: string
  ok: boolean
  detail?: string
  icon: string
}

const Wrap = styled(Card)`
  padding: 16px;
`

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
`

const Score = styled.div<{ $color: string }>`
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
  color: ${({ $color }) => $color};
  font-variant-numeric: tabular-nums;
`

const Bar = styled.div`
  height: 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 14px;
`

const Fill = styled.div<{ $pct: number; $color: string }>`
  width: ${({ $pct }) => $pct}%;
  height: 100%;
  background: linear-gradient(90deg, ${({ $color }) => $color}, ${({ $color }) => $color}dd);
  border-radius: 999px;
  transition: width 600ms ease;
`

const Checks = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
`

const CheckItem = styled.div<{ $ok: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: ${({ $ok }) => $ok ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)'};
  border: 1px solid ${({ $ok }) => $ok ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'};
  font-size: 13px;
  min-height: 44px;
`

const CheckIcon = styled.span`
  font-size: 16px;
  flex-shrink: 0;
`

const CheckText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`

const CheckLabel = styled.span`
  font-weight: 600;
  color: #f0f6fc;
`

const CheckDetail = styled.span`
  font-size: 11px;
  color: #8b949e;
`

export default function ReadinessCard({ trip }: Props) {
  const duration = getTripDuration(trip.startDate, trip.endDate)

  const tasks = trip.tasks ?? []
  const tasksDone = tasks.length > 0 && tasks.every(t => t.done)
  const tasksDoneCount = tasks.filter(t => t.done).length

  const packing = trip.packingItems ?? []
  const packingDone = packing.length > 0 && packing.every(p => p.packed)
  const packedCount = packing.filter(p => p.packed).length

  const flightsBooked = trip.flights.length > 0
  const accommodationsCovered = (() => {
    if (trip.accommodations.length === 0) return false
    // count nights covered (rough — sum of nights across stays)
    const nights = trip.accommodations.reduce((s, a) => {
      const d = (new Date(a.checkOut).getTime() - new Date(a.checkIn).getTime()) / (1000 * 60 * 60 * 24)
      return s + Math.max(0, Math.round(d))
    }, 0)
    return nights >= duration - 1
  })()
  const budgetSet = trip.budget.totalBudget > 0
  const eventsPlanned = trip.days.flatMap(d => d.events).length >= duration

  const checks: Check[] = [
    {
      label: 'טיסות',
      ok: flightsBooked,
      detail: flightsBooked ? `${trip.flights.length} מוזמנות` : 'לא הוזמנו',
      icon: '✈️',
    },
    {
      label: 'לינות',
      ok: accommodationsCovered,
      detail: accommodationsCovered ? `${trip.accommodations.length} מוזמנות` : `${trip.accommodations.length}/${duration - 1} לילות`,
      icon: '🏨',
    },
    {
      label: 'תקציב',
      ok: budgetSet,
      detail: budgetSet ? 'מוגדר' : 'לא הוגדר',
      icon: '💰',
    },
    {
      label: 'תכנית יומית',
      ok: eventsPlanned,
      detail: eventsPlanned ? 'מלאה' : `${trip.days.flatMap(d => d.events).length} אירועים`,
      icon: '🗓️',
    },
    {
      label: 'משימות',
      ok: tasksDone,
      detail: tasks.length > 0 ? `${tasksDoneCount}/${tasks.length} הושלמו` : 'אין משימות',
      icon: '✅',
    },
    {
      label: 'אריזה',
      ok: packingDone,
      detail: packing.length > 0 ? `${packedCount}/${packing.length} ארוז` : 'לא הוגדר',
      icon: '🎒',
    },
  ]

  const okCount = checks.filter(c => c.ok).length
  const score = Math.round((okCount / checks.length) * 100)
  const color = score >= 85 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const verdict = score >= 85 ? 'מוכנים לטיול 🎉' : score >= 50 ? 'בדרך הנכונה' : 'יש עוד עבודה'

  return (
    <Wrap variant="outlined">
      <Header>
        <div>
          <Typography variant="caption" style={{ color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            מדד מוכנות לטיול
          </Typography>
          <Typography variant="h6" style={{ margin: '4px 0 0' }}>{verdict}</Typography>
        </div>
        <Score $color={color}>{score}%</Score>
      </Header>
      <Bar><Fill $pct={score} $color={color} /></Bar>
      <Checks>
        {checks.map(c => (
          <CheckItem key={c.label} $ok={c.ok} title={c.detail}>
            <CheckIcon>{c.ok ? '✅' : c.icon}</CheckIcon>
            <CheckText>
              <CheckLabel>{c.label}</CheckLabel>
              {c.detail && <CheckDetail>{c.detail}</CheckDetail>}
            </CheckText>
          </CheckItem>
        ))}
      </Checks>
    </Wrap>
  )
}
