import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Stack,
  Typography,
  Button,
  Badge,
  Input,
  Select,
  ActionIcon,
  EmptyState,
  Checkbox,
  Box,
} from 'myk-library'
import { DataTable } from 'myk-library'
import type { ColumnDef } from 'myk-library'
import { Plus, Pencil, Trash2, ListTodo, History } from 'lucide-react'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import type { TripTask } from '@/types/task'
import { formatDateISO, formatDateShort } from '@/utils/date'
import TaskFormModal from '@/components/tasks/TaskFormModal'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

const formatCompletedAt = (iso: string): string => {
  try { return format(parseISO(iso), 'd MMM HH:mm', { locale: he }) } catch { return iso }
}

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  display: flex;
  flex-direction: column;
  gap: 24px;
`

type StatusFilter = 'open' | 'done' | 'all'
const EMPTY_TASKS: TripTask[] = []

export default function Tasks() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))

  const toggleTask = useTripStore(s => s.toggleTask)
  const removeTask = useTripStore(s => s.removeTask)

  const [showAdd, setShowAdd] = useState(false)
  const [editTask, setEditTask] = useState<TripTask | undefined>()
  const [status, setStatus] = useState<StatusFilter>('open')
  const [assignee, setAssignee] = useState('')
  const [query, setQuery] = useState('')

  const { isMobile } = useBreakpoint()
  const todayISO = useMemo(() => formatDateISO(new Date()), [])

  const familyById = useMemo(() => {
    const members = trip?.family ?? []
    return new Map(members.map(m => [m.id, m]))
  }, [trip?.family])

  const allTasks = trip?.tasks ?? EMPTY_TASKS

  const recentlyCompleted = useMemo(() => {
    return allTasks
      .filter(t => t.done && t.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .slice(0, 5)
  }, [allTasks])

  const { filteredTasks, openCount, doneCount, overdueCount } = useMemo(() => {
    const q = query.trim().toLowerCase()

    const tasks = allTasks
      .filter(t => {
        if (status === 'open' && t.done) return false
        if (status === 'done' && !t.done) return false
        if (assignee && t.assignedTo !== assignee) return false
        if (!q) return true
        const hay = `${t.title} ${t.description ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1

        if (!a.done) {
          const aDue = a.dueDate ?? '9999-12-31'
          const bDue = b.dueDate ?? '9999-12-31'
          if (aDue !== bDue) return aDue.localeCompare(bDue)
          return a.createdAt.localeCompare(b.createdAt)
        }

        const aDoneAt = a.completedAt ?? a.updatedAt
        const bDoneAt = b.completedAt ?? b.updatedAt
        return bDoneAt.localeCompare(aDoneAt)
      })

    const open = allTasks.filter(t => !t.done).length
    const done = allTasks.filter(t => t.done).length
    const overdue = allTasks.filter(t => !t.done && t.dueDate && t.dueDate < todayISO).length

    return { filteredTasks: tasks, openCount: open, doneCount: done, overdueCount: overdue }
  }, [allTasks, assignee, query, status, todayISO])

  const columns: ColumnDef<TripTask>[] = useMemo(() => [
    {
      key: 'done',
      header: '',
      width: 56,
      cell: (t) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={t.done}
            onChange={() => {
              if (!trip) return
              toggleTask(trip.id, t.id)
            }}
            aria-label={`${t.done ? 'סמן כלא בוצע' : 'סמן כבוצע'}: ${t.title}`}
          />
        </div>
      ),
    },
    {
      key: 'title',
      header: 'משימה',
      cell: (t) => (
        <Stack direction="column" spacing="xs">
          <Typography
            variant="body2"
            weight="semibold"
            style={{ textDecoration: t.done ? 'line-through' : undefined }}
          >
            {t.title}
          </Typography>
          {t.description && (
            <Typography variant="caption" color="#6b7280" maxLines={2}>
              {t.description}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      key: 'dueDate',
      header: 'עד / בוצע',
      width: 160,
      cell: (t) => {
        if (t.done && t.completedAt) {
          return (
            <Badge size="sm" variant="success">
              ✓ {formatCompletedAt(t.completedAt)}
            </Badge>
          )
        }
        if (!t.dueDate) return '—'
        const isOverdue = !t.done && t.dueDate < todayISO
        const isToday = t.dueDate === todayISO
        const variant = isOverdue ? 'error' : isToday ? 'warning' : 'default'
        return (
          <Badge size="sm" variant={variant}>
            {formatDateShort(t.dueDate)}
          </Badge>
        )
      },
    },
    {
      key: 'assignedTo',
      header: 'אחראי/ת',
      width: 160,
      cell: (t) => {
        if (!t.assignedTo) return '—'
        const m = familyById.get(t.assignedTo)
        if (!m) return '—'
        return (
          <Stack direction="row" spacing="xs" align="center">
            <Typography variant="body2" style={{ fontSize: 18 }}>{m.emoji}</Typography>
            <Typography variant="body2">{m.name}</Typography>
          </Stack>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      width: 88,
      cell: (t) => (
        <Stack direction="row" spacing="xs">
          <ActionIcon size="sm" variant="subtle" onClick={() => setEditTask(t)}>
            <Pencil size={12} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={() => {
              if (!trip) return
              if (confirm(`למחוק את המשימה "${t.title}"?`)) {
                removeTask(trip.id, t.id)
              }
            }}
          >
            <Trash2 size={12} />
          </ActionIcon>
        </Stack>
      ),
    },
  ], [familyById, removeTask, todayISO, toggleTask, trip])

  if (!trip) return null

  return (
    <PageWrapper $mobile={isMobile}>
      <Stack direction={isMobile ? 'column' : 'row'} align={isMobile ? 'stretch' : 'center'} justify="between" spacing="sm">
        <Stack direction="row" align="center" spacing="sm" style={{ flexWrap: 'wrap' }}>
          <Typography variant="h5" style={{ margin: 0 }}>
            <Stack direction="row" spacing="xs" align="center">
              <ListTodo size={18} />
              <span>משימות</span>
            </Stack>
          </Typography>
          <Badge variant="info" size="sm">{openCount} פתוחות</Badge>
          <Badge variant="success" size="sm">{doneCount} בוצעו</Badge>
          {overdueCount > 0 && <Badge variant="error" size="sm">{overdueCount} באיחור</Badge>}
        </Stack>

        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)} style={{ whiteSpace: 'nowrap', alignSelf: isMobile ? 'flex-end' : undefined }}>
          <Stack direction="row" spacing="xs" align="center">
            <Plus size={14} />
            <span>הוסף משימה</span>
          </Stack>
        </Button>
      </Stack>

      <Stack direction={isMobile ? 'column' : 'row'} spacing="md" align={isMobile ? 'stretch' : 'end'}>
        <Input
          label="חיפוש"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="שם או תיאור"
          style={{ flex: 1 }}
        />

        <Select
          label="סטטוס"
          value={status}
          onChange={e => setStatus(e.target.value as StatusFilter)}
          style={isMobile ? {} : { width: 160 }}
        >
          <option value="open">פתוחות</option>
          <option value="done">בוצעו</option>
          <option value="all">הכול</option>
        </Select>

        {trip.family.length > 0 && (
          <Select
            label="אחראי/ת"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            style={isMobile ? {} : { width: 200 }}
          >
            <option value="">הכול</option>
            {trip.family.map(m => (
              <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>
            ))}
          </Select>
        )}
      </Stack>

      {allTasks.length === 0 ? (
        <EmptyState
          title="אין משימות עדיין"
          description="הוסף משימה כדי שיהיה ברור מה נשאר לעשות לקראת הטיול"
          actionText="הוסף משימה"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <Box style={{ overflowX: 'auto' }}>
          <DataTable
            columns={columns}
            data={filteredTasks}
            variant="striped"
            size="sm"
            emptyState={(
              <EmptyState
                title="אין תוצאות"
                description="נסה לשנות את החיפוש או הפילטרים"
                actionText="נקה פילטרים"
                onAction={() => { setQuery(''); setStatus('open'); setAssignee('') }}
              />
            )}
          />
        </Box>
      )}

      {recentlyCompleted.length > 0 && (
        <Box>
          <Stack direction="row" spacing="xs" align="center" style={{ marginBottom: 8 }}>
            <History size={14} />
            <Typography variant="body2" style={{ fontWeight: 600 }}>בוצעו לאחרונה</Typography>
          </Stack>
          <Stack direction="column" spacing="xs">
            {recentlyCompleted.map(t => {
              const m = t.assignedTo ? familyById.get(t.assignedTo) : undefined
              return (
                <Stack key={t.id} direction="row" spacing="sm" align="center" style={{ flexWrap: 'wrap' }}>
                  <Typography variant="body2" style={{ textDecoration: 'line-through', color: '#6b7280' }}>
                    ✓ {t.title}
                  </Typography>
                  {t.completedAt && (
                    <Badge size="sm" variant="success">{formatCompletedAt(t.completedAt)}</Badge>
                  )}
                  {m && (
                    <Typography variant="caption" style={{ color: '#6b7280' }}>
                      {m.emoji} {m.name}
                    </Typography>
                  )}
                </Stack>
              )
            })}
          </Stack>
        </Box>
      )}

      <TaskFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        tripId={trip.id}
        family={trip.family}
      />

      {editTask && (
        <TaskFormModal
          key={editTask.id}
          open={!!editTask}
          onClose={() => setEditTask(undefined)}
          tripId={trip.id}
          family={trip.family}
          editTask={editTask}
        />
      )}
    </PageWrapper>
  )
}
