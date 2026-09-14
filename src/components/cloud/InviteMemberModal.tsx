import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Button, Stack, Typography } from 'myk-library'
import { X, UserPlus, Trash2, Crown, Clock } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { isFamilyCatalogEmail } from '@/lib/familyCatalog'
import { inviteFailureStatus, rpcErrorText } from '@/lib/inviteError'
import {
  cancelTripInvite,
  inviteUserToTrip,
  listPendingTripInvites,
  listTripMembers,
  removeUserFromTrip,
  type TripMember,
  type TripPendingInvite,
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

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  font-size: 16px;
  &:focus { outline: 2px solid #f59e0b; }
`

interface Props {
  tripId: string
  tripName: string
  open: boolean
  onClose: () => void
}

async function loadInviteSheet(tripId: string): Promise<{
  members: TripMember[]
  pending: TripPendingInvite[]
}> {
  const [members, pending] = await Promise.all([
    listTripMembers(tripId),
    listPendingTripInvites(tripId).catch(() => [] as TripPendingInvite[]),
  ])
  return { members, pending }
}

export default function InviteMemberModal({ tripId, tripName, open, onClose }: Props) {
  const { user } = useAuth()
  const [members, setMembers] = useState<TripMember[]>([])
  const [pending, setPending] = useState<TripPendingInvite[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadInviteSheet(tripId)
      .then(({ members: nextMembers, pending: nextPending }) => {
        if (cancelled) return
        setMembers(nextMembers)
        setPending(nextPending)
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
      const next = await loadInviteSheet(tripId)
      setMembers(next.members)
      setPending(next.pending)
    } catch (e) {
      setStatus(`שגיאה: ${rpcErrorText(e) || 'לא ידועה'}`)
    }
  }

  const onInvite = async () => {
    if (!email.trim()) return
    setBusy(true)
    setStatus('')
    try {
      const outcome = await inviteUserToTrip(tripId, email.trim())
      if (outcome === 'pending') {
        setStatus(`✓ הזמנה נשלחה אל ${email.trim()}. כשייכנסו עם Google, הטיול יופיע אצלם.`)
      } else {
        setStatus(`✓ ${email.trim()} נוסף לטיול`)
      }
      setEmail('')
      await refresh()
    } catch (e) {
      setStatus(inviteFailureStatus(e, email.trim()))
    } finally {
      setBusy(false)
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

  const onCancelInvite = async (invite: TripPendingInvite) => {
    if (!confirm(`לבטל את ההזמנה ל-${invite.email}?`)) return
    try {
      await cancelTripInvite(tripId, invite.email)
      await refresh()
    } catch (e) {
      setStatus(`שגיאה בביטול: ${rpcErrorText(e) || 'לא ידועה'}`)
    }
  }

  if (!open) return null

  const meIsOwner = members.find(m => m.user_id === user?.id)?.role === 'owner'

  return (
    <Backdrop onClick={onClose}>
      <Sheet onClick={e => e.stopPropagation()} dir="rtl">
        <Stack direction="row" justify="between" align="center">
          <Typography variant="h5" style={{ margin: 0 }}>שתף את "{tripName}"</Typography>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </Stack>

        <ShareTripLinkPanel tripId={tripId} tripName={tripName} />

        <div style={{ marginTop: 16 }}>
          <Typography variant="body2" style={{ color: '#6b7280', marginBottom: 8 }}>
            הזמינו לפי אימייל או שלחו לינק בוואטסאפ. מי שעוד לא נרשם יצטרף אחרי כניסה עם Google — רק לטיול הזה.
          </Typography>
          <Stack direction="row" spacing="sm">
            <Input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void onInvite() }}
              dir="ltr"
              style={{ textAlign: 'left' }}
            />
            <Button variant="primary" onClick={onInvite} disabled={busy || !email.trim()}>
              <Stack direction="row" spacing="xs" align="center">
                <UserPlus size={16} />
                <span>הזמן</span>
              </Stack>
            </Button>
          </Stack>
          {status && (
            <Typography variant="body2" style={{ color: status.startsWith('✓') ? '#10b981' : '#ef4444', marginTop: 8 }}>
              {status}
            </Typography>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <Typography variant="h6" style={{ marginBottom: 8 }}>חברי הטיול</Typography>
          {members.length === 0 ? (
            <Typography variant="body2" style={{ color: '#9ca3af' }}>טוען…</Typography>
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
        </div>

        {pending.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Typography variant="h6" style={{ marginBottom: 8 }}>הזמנות ממתינות</Typography>
            {pending.map(invite => (
              <Row key={invite.email}>
                <Stack direction="row" spacing="sm" align="center">
                  <Clock size={14} style={{ color: '#9ca3af' }} />
                  <Typography variant="body2" style={{ direction: 'ltr', textAlign: 'left' }}>
                    {invite.email}
                  </Typography>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {invite.role === 'owner' ? 'יוצר/ת ממתין/ה' : 'ממתין לכניסה'}
                  </span>
                </Stack>
                {meIsOwner && !isFamilyCatalogEmail(invite.email) && (
                  <button
                    onClick={() => void onCancelInvite(invite)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                    title="בטל הזמנה"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </Row>
            ))}
          </div>
        )}
      </Sheet>
    </Backdrop>
  )
}
