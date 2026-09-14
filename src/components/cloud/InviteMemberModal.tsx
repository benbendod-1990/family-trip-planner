import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Stack, Typography } from 'myk-library'
import { X, Trash2, Crown } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { rpcErrorText } from '@/lib/inviteError'
import {
  listTripMembers,
  removeUserFromTrip,
  type TripMember,
} from '@/lib/tripRepo'
import ShareTripLinkPanel from '@/components/cloud/ShareTripLinkPanel'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: 16px;
`

const Sheet = styled.div`
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  color: #111827;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  border-bottom: 1px solid #f3f4f6;
  &:last-child { border-bottom: none; }
`

interface Props {
  tripId: string
  tripName: string
  open: boolean
  onClose: () => void
}

export default function InviteMemberModal({ tripId, tripName, open, onClose }: Props) {
  const { user } = useAuth()
  const [members, setMembers] = useState<TripMember[]>([])
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listTripMembers(tripId)
      .then(nextMembers => {
        if (!cancelled) setMembers(nextMembers)
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatus(`שגיאה: ${rpcErrorText(e) || 'לא ידועה'}`)
      })
    return () => {
      cancelled = true
    }
  }, [open, tripId])

  const refresh = async () => {
    try {
      setMembers(await listTripMembers(tripId))
    } catch (e) {
      setStatus(`שגיאה: ${rpcErrorText(e) || 'לא ידועה'}`)
    }
  }

  const onRemove = async (m: TripMember) => {
    if (!confirm(`להסיר את ${m.email} מהטיול?`)) return
    try {
      await removeUserFromTrip(tripId, m.user_id)
      await refresh()
    } catch (e) {
      setStatus(`שגיאה בהסרה: ${rpcErrorText(e) || 'לא ידועה'}`)
    }
  }

  if (!open) return null

  const meIsOwner = members.find(m => m.user_id === user?.id)?.role === 'owner'

  return (
    <Backdrop onClick={onClose}>
      <Sheet onClick={e => e.stopPropagation()} dir="rtl">
        <Stack direction="row" justify="between" align="center">
          <Typography variant="h5" style={{ margin: 0 }}>חברי "{tripName}"</Typography>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </Stack>

        <Typography variant="body2" style={{ color: '#6b7280', marginTop: 8 }}>
          שיתוף הטיול הוא בלינק (הכפתור הירוק בכרטיס). כאן רואים מי כבר חבר.
        </Typography>

        <ShareTripLinkPanel tripId={tripId} tripName={tripName} />

        <div style={{ marginTop: 24 }}>
          <Typography variant="h6" style={{ marginBottom: 8 }}>חברי הטיול</Typography>
          {members.length === 0 ? (
            <Typography variant="body2" style={{ color: '#9ca3af' }}>
              {status || 'טוען…'}
            </Typography>
          ) : (
            members.map(m => (
              <Row key={m.user_id}>
                <Stack direction="row" spacing="sm" align="center">
                  {m.role === 'owner' && <Crown size={14} style={{ color: '#f59e0b' }} />}
                  <Typography variant="body2" style={{ direction: 'ltr', textAlign: 'left' }}>
                    {m.email}
                  </Typography>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {m.role === 'owner' ? 'יוצר' : 'חבר'}
                  </span>
                </Stack>
                {meIsOwner && m.role === 'member' && (
                  <button
                    onClick={() => void onRemove(m)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                    title="הסר"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </Row>
            ))
          )}
          {status && members.length > 0 && (
            <Typography variant="body2" style={{ color: '#ef4444', marginTop: 8 }}>
              {status}
            </Typography>
          )}
        </div>
      </Sheet>
    </Backdrop>
  )
}
