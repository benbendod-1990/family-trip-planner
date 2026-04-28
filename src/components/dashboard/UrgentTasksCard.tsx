import styled from 'styled-components'
import { Card } from 'myk-library'
import { useNavigate } from 'react-router-dom'
import type { TripPlan } from '@/types/trip-plan'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ChevronLeft } from 'lucide-react'

interface Props {
  trip: TripPlan
}

const Wrap = styled(Card)`
  padding: 16px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`

const Title = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const ViewAll = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  color: #f59e0b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: inherit;
  &:hover { background: rgba(245,158,11,0.1); }
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Row = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  text-align: right;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  min-height: 44px;
  transition: background 120ms ease;
  &:hover { background: rgba(255,255,255,0.06); }
`

const DueBadge = styled.span<{ $tone: 'overdue' | 'soon' | 'later' }>`
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  ${({ $tone }) => {
    if ($tone === 'overdue') return 'background: rgba(239,68,68,0.18); color: #f87171;'
    if ($tone === 'soon') return 'background: rgba(245,158,11,0.18); color: #fbbf24;'
    return 'background: rgba(139,148,158,0.18); color: #8b949e;'
  }}
`

const TaskTitle = styled.span`
  flex: 1;
  font-size: 14px;
  color: #f0f6fc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Empty = styled.div`
  text-align: center;
  padding: 16px;
  color: #8b949e;
  font-size: 13px;
`

export default function UrgentTasksCard({ trip }: Props) {
  const navigate = useNavigate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tasks = (trip.tasks ?? [])
    .filter(t => !t.done)
    .map(t => ({
      ...t,
      daysUntil: t.dueDate ? differenceInCalendarDays(parseISO(t.dueDate), today) : null,
    }))
    .sort((a, b) => {
      if (a.daysUntil === null && b.daysUntil === null) return 0
      if (a.daysUntil === null) return 1
      if (b.daysUntil === null) return -1
      return a.daysUntil - b.daysUntil
    })
    .slice(0, 4)

  if (tasks.length === 0) return null

  return (
    <Wrap variant="outlined">
      <Header>
        <Title>⚡ משימות לטיפול</Title>
        <ViewAll onClick={() => navigate(`/trip/${trip.id}/tasks`)}>
          לכל המשימות <ChevronLeft size={14} />
        </ViewAll>
      </Header>
      {tasks.length === 0 ? (
        <Empty>אין משימות פתוחות 🎉</Empty>
      ) : (
        <List>
          {tasks.map(t => {
            const tone: 'overdue' | 'soon' | 'later' =
              t.daysUntil === null ? 'later'
                : t.daysUntil < 0 ? 'overdue'
                : t.daysUntil <= 3 ? 'soon'
                : 'later'
            const dueLabel =
              t.daysUntil === null ? 'ללא תאריך'
                : t.daysUntil === 0 ? 'היום'
                : t.daysUntil === 1 ? 'מחר'
                : t.daysUntil < 0 ? `איחור ${Math.abs(t.daysUntil)}י`
                : `בעוד ${t.daysUntil}י`
            return (
              <Row key={t.id} onClick={() => navigate(`/trip/${trip.id}/tasks`)}>
                <DueBadge $tone={tone}>{dueLabel}</DueBadge>
                <TaskTitle>{t.title}</TaskTitle>
              </Row>
            )
          })}
        </List>
      )}
    </Wrap>
  )
}
