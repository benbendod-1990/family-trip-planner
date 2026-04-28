import { useParams } from 'react-router-dom'
import { Card, Typography } from 'myk-library'
import styled from 'styled-components'
import { useTripStore, getTotalSpent } from '@/stores/tripStore'
import { formatCurrency } from '@/utils/currency'
import { formatDateShort, getTripDuration } from '@/utils/date'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import CountdownTimer from '@/components/dashboard/CountdownTimer'
import PhaseBadge, { type TripPhase } from '@/components/dashboard/PhaseBadge'
import ReadinessCard from '@/components/dashboard/ReadinessCard'
import WeatherPreview from '@/components/dashboard/WeatherPreview'
import BookingsCard from '@/components/dashboard/BookingsCard'
import UrgentTasksCard from '@/components/dashboard/UrgentTasksCard'
import TodayCard from '@/components/dashboard/TodayCard'
import SpendingInsight from '@/components/dashboard/SpendingInsight'
import QuickActions from '@/components/dashboard/QuickActions'
import MiniStat from '@/components/dashboard/MiniStat'
import { Wallet, ListTodo, CalendarDays, Backpack } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px 12px 32px' : '24px')};
  display: flex;
  flex-direction: column;
  gap: ${({ $mobile }) => ($mobile ? '14px' : '20px')};
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  box-sizing: border-box;
`

const HeroCard = styled(Card)<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '20px 16px' : '32px 24px')};
  text-align: center;
  background: linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02));
  border: 1px solid rgba(245,158,11,0.18);
  position: relative;
  overflow: hidden;
`

const HeroEmoji = styled.div<{ $mobile: boolean }>`
  font-size: ${({ $mobile }) => ($mobile ? '44px' : '64px')};
  line-height: 1;
  margin-bottom: 8px;
`

const HeroTitle = styled.h2<{ $mobile: boolean }>`
  font-size: ${({ $mobile }) => ($mobile ? '20px' : '28px')};
  font-weight: 800;
  margin: 0 0 6px;
  letter-spacing: -0.01em;
  word-break: break-word;
`

const HeroMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 14px;
  font-size: 13px;
  color: #c9d1d9;
  margin-bottom: 10px;
`

const HeroMetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
  padding: 0 4px;
`

const StatsGrid = styled.div<{ $mobile: boolean }>`
  display: grid;
  grid-template-columns: repeat(${({ $mobile }) => ($mobile ? 2 : 4)}, minmax(0, 1fr));
  gap: ${({ $mobile }) => ($mobile ? '8px' : '14px')};
  width: 100%;
`

const FamilyCard = styled(Card)`
  padding: 14px 16px;
`

const FamilyTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
`

const FamilyRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
`

const FamilyMember = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 56px;
`

const Emoji = styled.div`
  font-size: 30px;
  line-height: 1;
`

const MemberName = styled.div`
  font-size: 11px;
  color: #c9d1d9;
  text-align: center;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Tip = styled.div`
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(96,165,250,0.08);
  border: 1px solid rgba(96,165,250,0.2);
  font-size: 13px;
  line-height: 1.5;
  color: #c9d1d9;
`

const TipIcon = styled.div`
  font-size: 18px;
  flex-shrink: 0;
  line-height: 1.2;
`

function determinePhase(startDate: string, endDate: string, todayISO: string): { phase: TripPhase; daysToStart: number; dayOfTrip: number } {
  const today = parseISO(todayISO)
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const daysToStart = differenceInCalendarDays(start, today)
  const dayOfTrip = differenceInCalendarDays(today, start) + 1

  if (today > end) return { phase: 'done', daysToStart, dayOfTrip }
  if (today >= start) return { phase: 'live', daysToStart, dayOfTrip }
  if (daysToStart <= 14) return { phase: 'soon', daysToStart, dayOfTrip }
  return { phase: 'planning', daysToStart, dayOfTrip }
}

function pickTip(phase: TripPhase, daysToStart: number): { icon: string; text: string } | null {
  if (phase === 'planning' && daysToStart > 60) {
    return { icon: '✈️', text: 'מומלץ להזמין טיסות 60-90 יום מראש לחיסכון משמעותי במחיר.' }
  }
  if (phase === 'planning' && daysToStart > 30) {
    return { icon: '🏨', text: 'זה הזמן לסגור הזמנות לינה - המחירים הטובים ביותר נסגרים חודש לפני הטיול.' }
  }
  if (phase === 'planning') {
    return { icon: '📋', text: 'התחילו לרשום משימות ולתכנן את הימים - נשארו פחות מחודשיים.' }
  }
  if (phase === 'soon' && daysToStart > 7) {
    return { icon: '🎒', text: 'התחילו להכין רשימת ציוד ולוודא שכל ההזמנות בידיכם.' }
  }
  if (phase === 'soon') {
    return { icon: '🛂', text: 'בדקו דרכונים, ביטוחים, מתאמים ומסמכים נדרשים - השבוע יוצאים!' }
  }
  return null
}

export default function Dashboard() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()

  if (!trip) return null

  const todayISO = new Date().toISOString().slice(0, 10)
  const duration = getTripDuration(trip.startDate, trip.endDate)
  const totalSpent = getTotalSpent(trip)
  const totalBudget = trip.budget.totalBudget
  const currency = trip.budget.currency
  const budgetPct = totalBudget > 0 ? Math.min(Math.round((totalSpent / totalBudget) * 100), 100) : 0

  const tasks = trip.tasks ?? []
  const doneTasks = tasks.filter(t => t.done).length
  const taskPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0

  const packingItems = trip.packingItems ?? []
  const packedItems = packingItems.filter(i => i.packed).length
  const packingPct = packingItems.length > 0 ? Math.round((packedItems / packingItems.length) * 100) : 0

  const totalEvents = trip.days.flatMap(d => d.events).length

  const { phase, daysToStart, dayOfTrip } = determinePhase(trip.startDate, trip.endDate, todayISO)
  const tip = pickTip(phase, daysToStart)

  return (
    <PageWrapper $mobile={isMobile}>
      {/* Hero — phase-aware */}
      <HeroCard $mobile={isMobile} variant="elevated">
        <HeroEmoji $mobile={isMobile}>{trip.coverEmoji}</HeroEmoji>
        <HeroTitle $mobile={isMobile}>{trip.name}</HeroTitle>
        <HeroMeta>
          <HeroMetaItem>📍 {trip.destination}</HeroMetaItem>
          <HeroMetaItem>🗓 {formatDateShort(trip.startDate)} – {formatDateShort(trip.endDate)}</HeroMetaItem>
          <HeroMetaItem>⏱ {duration} ימים</HeroMetaItem>
        </HeroMeta>
        <PhaseBadge phase={phase} daysToStart={daysToStart} dayOfTrip={dayOfTrip} totalDays={duration} />
      </HeroCard>

      {/* Countdown — only when there's something to count */}
      {phase !== 'done' && (
        <Card variant="outlined" padding="md">
          <SectionLabel>{phase === 'live' ? '🔥 הטיול בעיצומו' : '⏳ עוד כמה עד הטיול'}</SectionLabel>
          <CountdownTimer startDate={trip.startDate} endDate={trip.endDate} />
        </Card>
      )}

      {/* Today (during-trip) */}
      {phase === 'live' && <TodayCard trip={trip} todayISO={todayISO} />}

      {/* Stats grid */}
      <div>
        <SectionLabel>📊 סקירה מהירה</SectionLabel>
        <StatsGrid $mobile={isMobile}>
          <MiniStat
            title="תקציב"
            value={formatCurrency(totalSpent, currency)}
            description={totalBudget > 0 ? `מתוך ${formatCurrency(totalBudget, currency)}` : 'לא הוגדר'}
            icon={<Wallet size={16} />}
            color={budgetPct > 90 ? '#ef4444' : '#f59e0b'}
          />
          <MiniStat
            title="משימות"
            value={`${doneTasks}/${tasks.length}`}
            description={tasks.length > 0 ? `${taskPct}% הושלמו` : 'אין משימות'}
            icon={<ListTodo size={16} />}
            color={taskPct === 100 && tasks.length > 0 ? '#10b981' : '#f59e0b'}
          />
          <MiniStat
            title="ימי טיול"
            value={duration}
            description={`${totalEvents} אירועים`}
            icon={<CalendarDays size={16} />}
            color="#60a5fa"
          />
          <MiniStat
            title="ציוד"
            value={packingItems.length > 0 ? `${packedItems}/${packingItems.length}` : '—'}
            description={packingItems.length > 0 ? `${packingPct}% ארוז` : 'לא הוגדר'}
            icon={<Backpack size={16} />}
            color={packingPct === 100 && packingItems.length > 0 ? '#10b981' : '#f59e0b'}
          />
        </StatsGrid>
      </div>

      {/* Smart tip */}
      {tip && (
        <Tip>
          <TipIcon>{tip.icon}</TipIcon>
          <div><strong>טיפ לתכנון:</strong> {tip.text}</div>
        </Tip>
      )}

      {/* Readiness — pre-trip emphasis */}
      {phase !== 'done' && <ReadinessCard trip={trip} />}

      {/* Weather forecast */}
      <WeatherPreview tripId={trip.id} startDate={trip.startDate} endDate={trip.endDate} />

      {/* Bookings status */}
      <BookingsCard trip={trip} />

      {/* Spending insight */}
      <SpendingInsight trip={trip} todayISO={todayISO} phase={phase} />

      {/* Urgent tasks */}
      {phase !== 'done' && <UrgentTasksCard trip={trip} />}

      {/* Family */}
      {trip.family.length > 0 && (
        <FamilyCard variant="outlined">
          <FamilyTitle>👨‍👩‍👧‍👦 משפחה ({trip.family.length})</FamilyTitle>
          <FamilyRow>
            {trip.family.map(m => (
              <FamilyMember key={m.id} title={m.name}>
                <Emoji>{m.emoji}</Emoji>
                <MemberName>{m.name}</MemberName>
              </FamilyMember>
            ))}
          </FamilyRow>
        </FamilyCard>
      )}

      {/* Quick navigation */}
      <div>
        <SectionLabel>🚀 קיצורי דרך</SectionLabel>
        <QuickActions tripId={trip.id} />
      </div>

      {phase === 'done' && (
        <Card variant="outlined" padding="md">
          <Typography variant="h5" style={{ textAlign: 'center', margin: 0 }}>
            🎉 איזה כיף שהיה!
          </Typography>
          <Typography variant="body2" style={{ textAlign: 'center', color: '#8b949e', marginTop: 8 }}>
            הוצאתם {formatCurrency(totalSpent, currency)} ב-{duration} ימים. עברתם {totalEvents} חוויות יחד.
          </Typography>
        </Card>
      )}
    </PageWrapper>
  )
}
