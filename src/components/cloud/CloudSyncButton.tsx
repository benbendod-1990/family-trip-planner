import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Stack } from 'myk-library'
import { CloudOff, Loader2, Check, AlertCircle, RefreshCw, Mail } from 'lucide-react'
import styled from 'styled-components'
import { useAuth } from '@/lib/AuthContext'
import { useTripStore } from '@/stores/tripStore'
import { pushLocalToRemote, listTrips, deleteTrip, foldRemoteTrips, deleteCollapsedDuplicates } from '@/lib/tripRepo'
import { suppressNextPush } from '@/lib/tripAutoSync'
import {
  dropUnauthorizedDemoSeeds,
  remoteTripIds,
  resolveActiveTripId,
} from '@/lib/authTripSync'
import { syncFromGmail, type GmailSyncReport } from '@/lib/gmailSync'
import { GmailAuthError } from '@/lib/gmailToken'
import { getLastSync } from '@/lib/gmailSyncState'
import type { TripPlan } from '@/types/trip-plan'

// Auto-generated trips from the legacy Gmail-sync code (before we removed
// auto-create). The old code generated names like:
//   - "טיול AMS"   (flight arrivalAirport — IATA 3-letter)
//   - "טיול חדש" / "טיול לא ידוע"  (no destination)
//   - "טיול " (trailing space) — destinationOf() returned undefined
//   - "טיול {hotel-name-junk}" — when destinationOf returned address tail
// All bogus instances share these signals: single day (start === end),
// default ✈️ emoji, and name starts with "טיול ". The strict checks below
// avoid touching real trips the user named themselves.
const isLegacyAutoTrip = (t: TripPlan): boolean => {
  const name = (t.name ?? '').trim()
  if (/^טיול [A-Z]{3}$/.test(name)) return true
  if (name === 'טיול' || name === 'טיול חדש' || name === 'טיול לא ידוע') return true
  if (name.startsWith('טיול ') && t.coverEmoji === '✈️' && t.startDate === t.endDate) return true
  return false
}

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

const ToastButton = styled.button`
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: rgba(255, 255, 255, 0.32); }
`

const ToastDismiss = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  &:hover { color: #fff; }
`

type Mode = 'idle' | 'syncing' | 'gmail'
type ToastAction = { label: string; onClick: () => void }
type ToastState = { kind: 'ok' | 'err' | 'info'; text: string; action?: ToastAction } | null

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return iso
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'הרגע'
  if (min < 60) return `לפני ${min} דק׳`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `לפני ${hr} ש׳`
  const days = Math.floor(hr / 24)
  return `לפני ${days} ימים`
}

export default function CloudSyncButton() {
  const navigate = useNavigate()
  const { session, user, signOut, signInWithGoogle } = useAuth()
  const trips = useTripStore(s => s.trips)
  const [mode, setMode] = useState<Mode>('idle')
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!toast) return
    // Actionable toasts (e.g. "reconnect Gmail") stay until the user acts or
    // dismisses — auto-dismissing would hide the button before it's useful.
    if (toast.action) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Friendly "reconnect Gmail" prompt shown when the Gmail token expired/was
  // revoked. Re-running the Google OAuth (access_type=offline + prompt=consent)
  // mints and stores a fresh refresh token, so sync works again.
  const gmailReconnectToast = (): ToastState => ({
    kind: 'info',
    text: '🔌 החיבור ל-Gmail פג. צריך להתחבר מחדש כדי לחדש את הסנכרון.',
    action: {
      label: 'חבר מחדש את Gmail',
      onClick: () => { void signInWithGoogle() },
    },
  })

  // One-shot cleanup of auto-generated trips from the legacy Gmail-sync code.
  // Old code created a new trip for any booking date outside existing trips;
  // this bloated the list with junk. Delete from cloud + local once, then
  // mark done so we never run again.
  useEffect(() => {
    if (!session) return
    if (localStorage.getItem('legacy-auto-trip-cleanup-v2')) return
    let cancelled = false
    void (async () => {
      try {
        const remote = await listTrips()
        const bogusIds = new Set<string>()
        for (const t of remote) if (isLegacyAutoTrip(t)) bogusIds.add(t.id)
        for (const t of useTripStore.getState().trips) if (isLegacyAutoTrip(t)) bogusIds.add(t.id)
        if (bogusIds.size === 0) {
          localStorage.setItem('legacy-auto-trip-cleanup-v2', '1')
          return
        }
        for (const id of bogusIds) {
          try { await deleteTrip(id) } catch (e) { console.warn('cleanup: cloud delete failed', id, e) }
        }
        if (cancelled) return
        suppressNextPush()
        useTripStore.setState({
          trips: useTripStore.getState().trips.filter(t => !bogusIds.has(t.id)),
        })
        localStorage.setItem('legacy-auto-trip-cleanup-v2', '1')
        setToast({ kind: 'ok', text: `🧹 נוקו ${bogusIds.size} טיולים אוטומטיים שנוצרו בטעות` })
      } catch (e) {
        console.warn('legacy-auto-trip cleanup failed:', e)
        // Don't set the done flag — retry next mount.
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

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
      const remoteIds = remoteTripIds(remote)
      // Local wins on conflict (user's recent edits) — pick newer updatedAt.
      // Documents are the exception: the server owns them. See mergeRemoteTrips.
      // Canonical demo seeds the user is not a member of stay off the list
      // and are never pushed — save_trip would claim the family UUID.
      const { trips: merged, droppedIds } = foldRemoteTrips(
        dropUnauthorizedDemoSeeds(trips, remoteIds),
        remote,
      )
      if (droppedIds.length) {
        await deleteCollapsedDuplicates(droppedIds, [...trips, ...remote])
      }
      suppressNextPush()
      useTripStore.setState({
        trips: merged,
        activeTripId: resolveActiveTripId(merged, useTripStore.getState().activeTripId),
      })

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
      if (report.documentsAdded) parts.push(`${report.documentsAdded} מסמכים`)
      const summary = parts.length ? `הוסף: ${parts.join(', ')}` : 'לא נמצאו הזמנות חדשות'
      const ai = report.aiAugmented ? ` · 🤖 ${report.aiAugmented} שוחזרו ע״י AI` : ''
      const skipped = report.unmatched ? ` · דולגו ${report.unmatched} הזמנות שלא תאמו טיול קיים` : ''
      if (report.aiQuotaExceeded) {
        const more = report.aiSkipped ? ` · ${report.aiSkipped} לא נסרקו ע״י AI` : ''
        setToast({ kind: 'err', text: `⚠️ מכסת Gemini החינמית הסתיימה — נסה שוב בעוד דקה־שתיים. ${summary}${more}` })
      } else if (report.documentsUnavailable) {
        // Bookings still synced — only the attachment filing was skipped.
        setToast({
          kind: 'info',
          text: `📧 ${summary} · אחסון המסמכים לא הוגדר עדיין, אז הקבצים לא נשמרו`,
        })
      } else {
        setToast({ kind: 'ok', text: `📧 ${summary} (סרקתי ${report.scanned} מיילים${ai}${skipped})` })
      }
    } catch (e) {
      if (e instanceof GmailAuthError) {
        setToast(gmailReconnectToast())
      } else {
        const msg = e instanceof Error ? e.message : 'שגיאה'
        const isQuota = /\b429\b|quota|rate.?limit/i.test(msg)
        setToast({
          kind: 'err',
          text: isQuota
            ? '⚠️ מכסת Gemini החינמית (15/דקה או 1500/יום) הסתיימה. נסה שוב בעוד דקה־שתיים, או מחר אם זו המכסה היומית.'
            : msg.slice(0, 200),
        })
      }
    }
    setMode('idle')
  }

  const busy = mode !== 'idle'
  const lastSync = getLastSync(user?.id)
  const gmailTooltip = lastSync
    ? `סורק רק מיילים חדשים מאז ${formatRelative(lastSync.lastSyncIso)}. בסנכרון הקודם: ${lastSync.lastScanned} מיילים, ${lastSync.lastAdded} נוספו לטיולים.`
    : 'סורק את הGmail שלך לאישורי הזמנות (טיסות, מלונות, רכבים) ומשייך לטיולים לפי תאריכים. הסנכרון הראשון יקח קצת יותר.'

  return (
    <>
      <Stack direction="row" spacing="xs" align="center">
        <Button variant="ghost" onClick={syncNow} disabled={busy} title={`מחובר כ-${user?.email}. מסנכרן את הטיולים עם הענן.`}>
          <Stack direction="row" spacing="xs" align="center">
            {mode === 'syncing' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            <span>סנכרן</span>
          </Stack>
        </Button>
        <Button variant="ghost" onClick={syncGmail} disabled={busy} title={gmailTooltip}>
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
          {toast.action && (
            <>
              <ToastButton
                onClick={() => { toast.action?.onClick(); setToast(null) }}
              >
                {toast.action.label}
              </ToastButton>
              <ToastDismiss onClick={() => setToast(null)} aria-label="סגור">✕</ToastDismiss>
            </>
          )}
        </Toast>
      )}
    </>
  )
}
