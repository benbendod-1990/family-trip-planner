import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Card } from 'myk-library'
import { ThemeProvider } from 'styled-components'
import styled from 'styled-components'
import { useTripStore, getTotalSpent } from '@/stores/tripStore'
import { formatCurrency } from '@/utils/currency'
import { formatDateShort, getTripDuration } from '@/utils/date'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { warmTheme, warmDisplayFont, warmPageBackground } from '@/theme/warmTheme'
import TripMascot from '@/components/dashboard/TripMascot'
import ReadinessCard from '@/components/dashboard/ReadinessCard'
import WeatherPreview from '@/components/dashboard/WeatherPreview'
import BookingsCard from '@/components/dashboard/BookingsCard'
import UrgentTasksCard from '@/components/dashboard/UrgentTasksCard'
import TodayCard from '@/components/dashboard/TodayCard'
import SpendingInsight from '@/components/dashboard/SpendingInsight'
import QuickActions from '@/components/dashboard/QuickActions'
import MiniStat from '@/components/dashboard/MiniStat'
import { Wallet, ListTodo, CalendarDays, Backpack, Menu, Map as MapIcon, Compass, CalendarRange, Sun } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'

const PageWrapper = styled.div<{ $mobile: boolean }>`
  background: ${warmPageBackground};
  min-height: 100%;
  padding: ${({ $mobile }) => ($mobile ? '12px 12px 96px' : '24px')};
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

const HeroCard = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '28px 20px 24px' : '40px 32px 32px')};
  text-align: center;
  background: ${({ theme }) => theme.colors.gray[100]};
  border-radius: 28px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const MascotWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
`

const HeroTitle = styled.h2<{ $mobile: boolean }>`
  font-family: ${warmDisplayFont};
  font-size: ${({ $mobile }) => ($mobile ? '24px' : '32px')};
  font-weight: 500;
  margin: 0 0 6px;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const HeroSub = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.gray[500]};
  margin-bottom: 20px;
`

const HeroCaption = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.gray[500]};
  margin-bottom: 4px;
`

const HeroCountdown = styled.div<{ $mobile: boolean }>`
  font-family: ${warmDisplayFont};
  font-size: ${({ $mobile }) => ($mobile ? '40px' : '52px')};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
  line-height: 1.1;
`

const SectionLabel = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
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
  color: ${({ theme }) => theme.colors.gray[500]};
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
  color: ${({ theme }) => theme.colors.gray[600]};
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
  background: ${({ theme }) => theme.colors.primary[50]};
  border: 1px solid ${({ theme }) => theme.colors.primary[200]};
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const TipIcon = styled.div`
  font-size: 18px;
  flex-shrink: 0;
  line-height: 1.2;
`

const BottomNav = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
  background: ${({ theme }) => theme.colors.white};
  border-top: 1px solid ${({ theme }) => theme.colors.gray[200]};
  z-index: 50;
`

const NavBtn = styled.button<{ $active?: boolean; $disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  cursor: ${({ $disabled }) => ($disabled ? 'default' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.4 : 1)};
  color: ${({ theme, $active }) => ($active ? '#D9607E' : theme.colors.gray[500])};
`

function determinePhase(startDate: string, endDate: string, todayISO: string): { phase: 'planning' | 'soon' | 'live' | 'done'; daysToStart: number; dayOfTrip: number } {
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

function pickTip(phase: string, daysToStart: number): { icon: string; text: string } | null {
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

function DashboardContent() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
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
  const currentPath = location.pathname.split('/').pop()
  const shortDestination = trip.destination.split(',').pop()?.trim() || trip.destination

  return (
    <PageWrapper $mobile={isMobile}>
      {/* Hero — phase-aware */}
      <HeroCard $mobile={isMobile}>
        <MascotWrap><TripMascot size={isMobile ? 100 : 130} /></MascotWrap>
        <HeroTitle $mobile={isMobile}>{shortDestination} מחכה לנו</HeroTitle>
        <HeroSub>📍 {trip.destination} · 🗓 {formatDateShort(trip.startDate)} – {formatDateShort(trip.endDate)} · ⏱ {duration} ימים</HeroSub>

        {phase === 'done' ? (
          <HeroCountdown $mobile={isMobile}>🎉 טיול נהדר!</HeroCountdown>
        ) : phase === 'live' ? (
          <>
            <HeroCaption>יום {dayOfTrip} מתוך {duration} · הטיול בעיצומו</HeroCaption>
            <HeroCountdown $mobile={isMobile}>✈️ עכשיו</HeroCountdown>
          </>
        ) : (
          <>
            <HeroCaption>עד ההמראה · {formatDateShort(trip.startDate)}</HeroCaption>
            <HeroCountdown $mobile={isMobile}>{daysToStart} ימים</HeroCountdown>
          </>
        )}
      </HeroCard>

      {/* Today (during-trip) */}
      {phase === 'live' && <TodayCard trip={trip} todayISO={todayISO} />}

      {/* Stats grid */}
      <div>
        <SectionLabel>סקירה מהירה</SectionLabel>
        <StatsGrid $mobile={isMobile}>
          <MiniStat
            title="תקציב"
            value={formatCurrency(totalSpent, currency)}
            description={totalBudget > 0 ? `מתוך ${formatCurrency(totalBudget, currency)}` : 'לא הוגדר'}
            icon={<Wallet size={16} />}
            color={budgetPct > 90 ? '#ef4444' : '#D67A1F'}
          />
          <MiniStat
            title="משימות"
            value={`${doneTasks}/${tasks.length}`}
            description={tasks.length > 0 ? `${taskPct}% הושלמו` : 'אין משימות'}
            icon={<ListTodo size={16} />}
            color={taskPct === 100 && tasks.length > 0 ? '#10b981' : '#D67A1F'}
          />
          <MiniStat
            title="ימי טיול"
            value={duration}
            description={`${totalEvents} אירועים`}
            icon={<CalendarDays size={16} />}
            color="#8F6FC2"
          />
          <MiniStat
            title="ציוד"
            value={packingItems.length > 0 ? `${packedItems}/${packingItems.length}` : '—'}
            description={packingItems.length > 0 ? `${packingPct}% ארוז` : 'לא הוגדר'}
            icon={<Backpack size={16} />}
            color={packingPct === 100 && packingItems.length > 0 ? '#10b981' : '#D67A1F'}
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
        <SectionLabel>קיצורי דרך</SectionLabel>
        <QuickActions tripId={trip.id} />
      </div>

      {isMobile && (
        <BottomNav>
          <NavBtn onClick={() => navigate(`/trip/${trip.id}/travel`)}>
            <Menu size={20} /> עוד
          </NavBtn>
          <NavBtn onClick={() => navigate(`/trip/${trip.id}/map`)}>
            <MapIcon size={20} /> מפה
          </NavBtn>
          <NavBtn $disabled title="בקרוב">
            <Compass size={20} /> מה עושים?
          </NavBtn>
          <NavBtn onClick={() => navigate(`/trip/${trip.id}/itinerary`)}>
            <CalendarRange size={20} /> ימים
          </NavBtn>
          <NavBtn $active={currentPath === 'dashboard'} onClick={() => navigate(`/trip/${trip.id}/dashboard`)}>
            <Sun size={20} /> היום
          </NavBtn>
        </BottomNav>
      )}
    </PageWrapper>
  )
}

export default function Dashboard() {
  return (
    <ThemeProvider theme={warmTheme}>
      <DashboardContent />
    </ThemeProvider>
  )
}
