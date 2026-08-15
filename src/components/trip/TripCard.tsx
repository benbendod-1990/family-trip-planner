import { lazy, Suspense, useState } from 'react'
import { Card, Badge, Stack, Chip, ActionIcon, Typography } from 'myk-library'
import { useNavigate } from 'react-router-dom'
import { Trash2, Calendar, Download, Archive, Users } from 'lucide-react'
import { useTripStore } from '@/stores/tripStore'
import { formatDateShort, getTripDuration } from '@/utils/date'
import styled from 'styled-components'
import type { TripPlan } from '@/types/trip-plan'
import { exportTripAsJSON } from '@/utils/export'
import { useArchiveStore } from '@/stores/archiveStore'
import { useAuth } from '@/lib/AuthContext'
import { destinationColor, warmDisplayFont } from '@/theme/warmTheme'

/*
 * Both modals are lazy because TripCard renders on Home, the eager start_url.
 * InviteMemberModal in particular reaches tripRepo → supabase (~186kB), which
 * was landing in the entry bundle and blocking first paint for a dialog that
 * only opens on a deliberate tap. They already render behind state flags, so
 * the chunk is not requested until the modal is actually opened.
 */
const PostTripDebriefModal = lazy(() => import('@/components/archive/PostTripDebriefModal'))
const InviteMemberModal = lazy(() => import('@/components/cloud/InviteMemberModal'))

const Emoji = styled.div`
  font-size: 48px;
  text-align: center;
  margin-bottom: 8px;
`

const AccentBar = styled.div<{ $color: string }>`
  height: 6px;
  margin: -16px -16px 12px;
  border-radius: 14px 14px 0 0;
  background: ${({ $color }) => $color};
`

const Name = styled.div<{ $past: boolean }>`
  font-family: ${warmDisplayFont};
  font-size: 20px;
  font-weight: 500;
  text-align: center;
  color: ${({ theme, $past }) => ($past ? theme.colors.gray[500] : theme.colors.gray[900])};
  ${({ $past }) => $past && 'text-decoration: line-through; text-decoration-thickness: 1.5px;'}
`

/* A finished trip stays on the list as a memory, so it reads as done rather
   than as something still being planned. */
const PastDates = styled(Typography)<{ $past: boolean }>`
  ${({ $past }) => $past && 'text-decoration: line-through;'}
`

interface Props {
  trip: TripPlan
  index?: number
}

export default function TripCard({ trip, index = 0 }: Props) {
  const navigate = useNavigate()
  const deleteTrip = useTripStore(s => s.deleteTrip)
  const archivedTrips = useArchiveStore(s => s.archivedTrips)
  const duration = getTripDuration(trip.startDate, trip.endDate)
  const [showDebrief, setShowDebrief] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const { session } = useAuth()
  const isArchived = archivedTrips.some(a => a.id === trip.id)
  const accent = destinationColor(index)
  // Same rule the Dashboard uses for its 'done' phase: the trip is over once
  // today is past its last day.
  const isPast = trip.endDate < new Date().toISOString().slice(0, 10)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`למחוק את הטיול "${trip.name}"?`)) {
      deleteTrip(trip.id)
    }
  }

  return (
    <>
    <Card
      variant="elevated"
      hoverable
      padding="md"
      onClick={() => navigate(`/trip/${trip.id}/dashboard`)}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      <AccentBar $color={accent.fg} />
      <div style={{ position: 'absolute', top: 18, left: 12 }}>
        <Stack direction="row" spacing="xs">
          {session && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowInvite(true) }}
              title="שתף עם בן/בת זוג"
              style={{ color: '#3b82f6' }}
            >
              <Users size={14} />
            </ActionIcon>
          )}
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowDebrief(true) }}
            title={isArchived ? 'ערוך זיכרונות' : 'סיים טיול ושמור זיכרונות'}
            style={isArchived ? { color: '#f59e0b' } : undefined}
          >
            <Archive size={14} />
          </ActionIcon>
          <ActionIcon variant="subtle" size="sm" onClick={(e: React.MouseEvent) => { e.stopPropagation(); exportTripAsJSON(trip) }} title="ייצא כ-JSON">
            <Download size={14} />
          </ActionIcon>
          <ActionIcon variant="subtle" size="sm" onClick={handleDelete}>
            <Trash2 size={14} />
          </ActionIcon>
        </Stack>
      </div>

      <Stack direction="column" spacing="sm" align="center">
        <Emoji>{trip.coverEmoji}</Emoji>
        <Name $past={isPast}>{trip.name}</Name>
        <Badge style={{ background: accent.bg, color: accent.fg }}>{trip.destination}</Badge>
        <Stack direction="row" spacing="xs" align="center">
          <Calendar size={14} />
          <PastDates $past={isPast} variant="body2" style={{ color: '#8F7B5C' }}>
            {formatDateShort(trip.startDate)} – {formatDateShort(trip.endDate)}
          </PastDates>
        </Stack>
        <Chip size="sm" variant="default">{duration} ימים</Chip>
        {trip.family.length > 0 && (
          <Typography variant="body2" style={{ color: '#8F7B5C' }}>
            {trip.family.map(m => m.emoji).join(' ')} {trip.family.length} נוסעים
          </Typography>
        )}
        {isArchived && (
          <Badge variant="success" size="sm">✓ נשמר בזיכרון</Badge>
        )}
      </Stack>
    </Card>

    {showDebrief && (
      <Suspense fallback={null}>
        <PostTripDebriefModal
          open={showDebrief}
          onClose={() => setShowDebrief(false)}
          trip={trip}
        />
      </Suspense>
    )}
    {showInvite && (
      <Suspense fallback={null}>
        <InviteMemberModal
          open={showInvite}
          onClose={() => setShowInvite(false)}
          tripId={trip.id}
          tripName={trip.name}
        />
      </Suspense>
    )}
    </>
  )
}
