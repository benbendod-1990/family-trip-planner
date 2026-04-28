import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Stack } from 'myk-library'
import { CloudOff, Loader2, Check, AlertCircle, RefreshCw, Mail } from 'lucide-react'
import styled from 'styled-components'
import { useAuth } from '@/lib/AuthContext'
import { useTripStore } from '@/stores/tripStore'
import { pushLocalToRemote, listTrips } from '@/lib/tripRepo'
import { suppressNextPush } from '@/lib/tripAutoSync'
import { syncFromGmail, type GmailSyncReport } from '@/lib/gmailSync'

const Toast = styled.div<{ $kind: 'ok' | 'err' | 'info' }>`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ $kind }) =>
    $kind === 'ok' ? '#10b981' : $kind === 'err' ? '#ef4444' : '#3b82f6'};
  color: #fff;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1100;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  animation: slideUp 0.18s ease-out;
  max-width: 90vw;
  text-align: center;
  @keyframes slideUp {
    from { transform: translate(-50%, 20px); opacity: 0; }
    to   { transform: translate(-50%, 0);    opacity: 1; }
  }
`

type Mode = 'idle' | 'syncing' | 'gmail'
type ToastState = { kind: 'ok' | 'err' | 'info'; text: string } | null

export default function CloudSyncButton() {
  const navigate = useNavigate()
  const { session, user, signOut } = useAuth()
  const trips = useTripStore(s => s.trips)
  const [mode, setMode] = useState<Mode>('idle')
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (!session) {
    return (
      <Button variant="ghost" onClick={() => navigate('/login')} title="התחבר לסנכרון משפחתי">
        <Stack direction="row" spacing="xs" align="center">
          <CloudOff size={16} />
          <span>התחבר</span>
        </Stack>
      </Button>
    )
  }

  // One-shot two-way sync: pull cloud first, merge, push everything back.
  const syncNow = async () => {
    setMode('syncing')
    try {
      const remote = await listTrips()
      const remoteById = new Map(remote.map(t => [t.id, t]))
      // Local wins on conflict (user's recent edits) — pick newer updatedAt.
      const merged = [...trips]
      for (const r of remote) {
        const local = trips.find(t => t.id === r.id)
        if (!local) merged.push(r)
        else if (new Date(r.updatedAt) > new Date(local.updatedAt)) {
          const idx = merged.findIndex(t => t.id === r.id)
          merged[idx] = r
        }
      }
      suppressNextPush()
      useTripStore.setState({ trips: merged })

      const outcomes = await pushLocalToRemote(merged)
      const ok = outcomes.filter(o => o.ok).length
      const failed = outcomes.filter(o => !o.ok)
      if (failed.length) {
        console.error('sync failures:', failed)
        setToast({ kind: 'err', text: `${ok}/${merged.length} סונכרנו. ${failed[0]?.error?.slice(0, 100)}` })
      } else {
        const pulled = remote.length - trips.filter(t => remoteById.has(t.id)).length
        const pushed = merged.length - remote.length
        const parts = []
        if (pulled > 0) parts.push(`${pulled} ירדו מהענן`)
        if (pushed > 0) parts.push(`${pushed} עלו לענן`)
        if (parts.length === 0) parts.push(`${ok} טיולים מסונכרנים`)
        setToast({ kind: 'ok', text: `✓ ${parts.join(', ')}` })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה'
      setToast({ kind: 'err', text: msg.slice(0, 200) })
    }
    setMode('idle')
  }

  const syncGmail = async () => {
    setMode('gmail')
    try {
      const report: GmailSyncReport = await syncFromGmail()
      const parts = []
      if (report.flightsAdded) parts.push(`${report.flightsAdded} טיסות`)
      if (report.hotelsAdded) parts.push(`${report.hotelsAdded} מלונות`)
      if (report.carsAdded) parts.push(`${report.carsAdded} רכבים`)
      if (report.tripsCreated) parts.push(`${report.tripsCreated} טיולים חדשים`)
      const summary = parts.length ? `הוסף: ${parts.join(', ')}` : 'לא נמצאו הזמנות חדשות'
      setToast({ kind: 'ok', text: `📧 ${summary} (סרקתי ${report.scanned} מיילים)` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      setToast({ kind: 'err', text: msg.slice(0, 200) })
    }
    setMode('idle')
  }

  const busy = mode !== 'idle'

  return (
    <>
      <Stack direction="row" spacing="xs" align="center">
        <Button variant="ghost" onClick={syncNow} disabled={busy} title={`מחובר כ-${user?.email}. מסנכרן את הטיולים עם הענן.`}>
          <Stack direction="row" spacing="xs" align="center">
            {mode === 'syncing' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            <span>סנכרן</span>
          </Stack>
        </Button>
        <Button variant="ghost" onClick={syncGmail} disabled={busy} title="סורק את ה-Gmail שלך לאישורי הזמנות (טיסות, מלונות, רכבים) ומשייך לטיולים לפי תאריכים">
          <Stack direction="row" spacing="xs" align="center">
            {mode === 'gmail' ? <Loader2 size={16} className="spin" /> : <Mail size={16} />}
            <span>Gmail</span>
          </Stack>
        </Button>
        <Button variant="ghost" onClick={signOut} title={`התנתק (${user?.email})`}>
          <span style={{ fontSize: 14 }}>🚪</span>
        </Button>
      </Stack>
      {toast && (
        <Toast $kind={toast.kind}>
          {toast.kind === 'ok' && <Check size={16} />}
          {toast.kind === 'err' && <AlertCircle size={16} />}
          <span>{toast.text}</span>
        </Toast>
      )}
    </>
  )
}
