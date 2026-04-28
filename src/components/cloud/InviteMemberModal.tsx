import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Button, Stack, Typography } from 'myk-library'
import { X, UserPlus, Trash2, Crown } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import {
  inviteUserToTrip,
  listTripMembers,
  removeUserFromTrip,
  type TripMember,
} from '@/lib/tripRepo'

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

export default function InviteMemberModal({ tripId, tripName, open, onClose }: Props) {
  const { user } = useAuth()
  const [members, setMembers] = useState<TripMember[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open, tripId])

  const refresh = async () => {
    try {
      setMembers(await listTripMembers(tripId))
    } catch (e) {
      setStatus(`שגיאה: ${e instanceof Error ? e.message : 'לא ידועה'}`)
    }
  }

  const onInvite = async () => {
    if (!email.trim()) return
    setBusy(true)
    setStatus('')
    try {
      await inviteUserToTrip(tripId, email.trim())
      setStatus(`✓ ${email} נוסף לטיול`)
      setEmail('')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      if (msg.includes('user_not_found')) {
        setStatus(`${email} עדיין לא נרשם. בקש שייכנס פעם אחת ל-${window.location.origin}/login ואז תזמין שוב.`)
      } else if (msg.includes('forbidden')) {
        setStatus('רק יוצר הטיול יכול להזמין')
      } else {
        setStatus(`שגיאה: ${msg}`)
      }
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
      setStatus(`שגיאה בהסרה: ${e instanceof Error ? e.message : 'לא ידועה'}`)
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

        <div style={{ marginTop: 16 }}>
          <Typography variant="body2" style={{ color: '#6b7280', marginBottom: 8 }}>
            הזמן בן/בת זוג או חבר. הם חייבים להיכנס פעם אחת ל-{window.location.host} עם Google לפני שתוכל להזמין.
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
      </Sheet>
    </Backdrop>
  )
}
