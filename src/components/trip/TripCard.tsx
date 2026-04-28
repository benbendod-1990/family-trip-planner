import { useState } from 'react'
import { Card, Badge, Stack, Chip, ActionIcon, Typography } from 'myk-library'
import { useNavigate } from 'react-router-dom'
import { Trash2, Calendar, Download, Archive, Users } from 'lucide-react'
import { useTripStore } from '@/stores/tripStore'
import { formatDateShort, getTripDuration } from '@/utils/date'
import styled from 'styled-components'
import type { TripPlan } from '@/types/trip-plan'
import { exportTripAsJSON } from '@/utils/export'
import PostTripDebriefModal from '@/components/archive/PostTripDebriefModal'
import { useArchiveStore } from '@/stores/archiveStore'
import InviteMemberModal from '@/components/cloud/InviteMemberModal'
import { useAuth } from '@/lib/AuthContext'

const Emoji = styled.div`
  font-size: 48px;
  text-align: center;
  margin-bottom: 8px;
`

interface Props {
  trip: TripPlan
}

export default function TripCard({ trip }: Props) {
  const navigate = useNavigate()
  const deleteTrip = useTripStore(s => s.deleteTrip)
  const archivedTrips = useArchiveStore(s => s.archivedTrips)
  const duration = getTripDuration(trip.startDate, trip.endDate)
  const [showDebrief, setShowDebrief] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const { session } = useAuth()
  const isArchived = archivedTrips.some(a => a.id === trip.id)

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
      <div style={{ position: 'absolute', top: 12, left: 12 }}>
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
        <Typography variant="h5" style={{ textAlign: 'center', margin: 0 }}>{trip.name}</Typography>
        <Badge variant="info">{trip.destination}</Badge>
        <Stack direction="row" spacing="xs" align="center">
          <Calendar size={14} />
          <Typography variant="body2" style={{ color: '#6b7280' }}>
            {formatDateShort(trip.startDate)} – {formatDateShort(trip.endDate)}
          </Typography>
        </Stack>
        <Chip size="sm" variant="default">{duration} ימים</Chip>
        {trip.family.length > 0 && (
          <Typography variant="body2" style={{ color: '#9ca3af' }}>
            {trip.family.map(m => m.emoji).join(' ')} {trip.family.length} נוסעים
          </Typography>
        )}
        {isArchived && (
          <Badge variant="success" size="sm">✓ נשמר בזיכרון</Badge>
        )}
      </Stack>
    </Card>

    {showDebrief && (
      <PostTripDebriefModal
        open={showDebrief}
        onClose={() => setShowDebrief(false)}
        trip={trip}
      />
    )}
    {showInvite && (
      <InviteMemberModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        tripId={trip.id}
        tripName={trip.name}
      />
    )}
    </>
  )
}
