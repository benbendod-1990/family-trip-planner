import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Stack } from 'myk-library'
import { CloudOff, Loader2, Check, AlertCircle, RefreshCw, Mail } from 'lucide-react'
import styled from 'styled-components'
import { useAuth } from '@/lib/AuthContext'
import { useTripStore } from '@/stores/tripStore'
import { pushLocalToRemote, listTrips, deleteTrip } from '@/lib/tripRepo'
import { suppressNextPush } from '@/lib/tripAutoSync'
import { syncFromGmail, type GmailSyncReport } from '@/lib/gmailSync'
import { getLastSync } from '@/lib/gmailSyncState'
import { tripHasPlaceholders } from '@/lib/tripMerge'
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

type Mode = 'idle' | 'syncing' | 'gmail'
type ToastState = { kind: 'ok' | 'err' | 'info'; text: string } | null

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
  const { session, user, signOut } = useAuth()
  const trips = useTripStore(s => s.trips)
  const [mode, setMode] = useState<Mode>('idle')
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

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

  // Auto-rescan: if any trip has placeholder bookings, do a full sweep:
  //   1. Pull from cloud first — direct DB edits (e.g. Aegean date fix) live
  //      only in cloud until something pulls; without this the local stub
  //      keeps masquerading as fresh.
  //   2. Force-full Gmail sweep — bypass incremental checkpoint because the
  //      source emails are usually older than the window.
  //   3. Only mark "done" AFTER success. If the rescan throws or no
  //      placeholder gets fixed, the next refresh tries again.
  useEffect(() => {
    if (!session) return
    if (!trips.some(tripHasPlaceholders)) return
    if (sessionStorage.getItem('auto-placeholder-rescan-done')) return
    let cancelled = false
    void (async () => {
      setMode('gmail')
      setToast({ kind: 'info', text: '🤖 מזהה הזמנות חסרות — מושך מהענן ומפעיל AI…' })
      try {
        // Step 1 — pull from cloud first. The cloud may already have fresher
        // data (admin edits, other devices) that supersedes local stubs.
        const remote = await listTrips()
        const remoteById = new Map(remote.map(t => [t.id, t]))
        const merged = trips.map(local => {
          const r = remoteById.get(local.id)
          if (!r) return local
          return new Date(r.updatedAt).getTime() > new Date(local.updatedAt).getTime() ? r : local
        })
        for (const r of remote) {
          if (!merged.some(t => t.id === r.id)) merged.push(r)
        }
        suppressNextPush()
        useTripStore.setState({ trips: merged })
        if (cancelled) return

        // Step 2 — if cloud pull alone resolved the placeholders, skip Gmail.
        const stillNeedsAi = merged.some(tripHasPlaceholders)
        if (!stillNeedsAi) {
          setToast({ kind: 'ok', text: '✓ נמשכו פרטים מעודכנים מהענן' })
          sessionStorage.setItem('auto-placeholder-rescan-done', '1')
          setMode('idle')
          return
        }

        const report = await syncFromGmail({ forceFull: true })
        if (cancelled) return
        const fixed = report.aiAugmented
        if (fixed) {
          setToast({ kind: 'ok', text: `✓ AI שיחזר ${fixed} פרטים חסרים מהמיילים שלך` })
          sessionStorage.setItem('auto-placeholder-rescan-done', '1')
        } else {
          setToast({ kind: 'info', text: 'לא נמצאו פרטים נוספים בג׳מייל. תוכל לייבא PDF/טקסט דרך "ייבוא חכם (AI)".' })
          // don't set the done flag — let next refresh retry
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'שגיאה'
        setToast({ kind: 'err', text: `סנכרון אוטומטי נכשל: ${msg.slice(0, 150)}` })
        // don't set done flag — retry on next refresh
      }
      setMode('idle')
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, trips.length])

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
      const summary = parts.length ? `הוסף: ${parts.join(', ')}` : 'לא נמצאו הזמנות חדשות'
      const ai = report.aiAugmented ? ` · 🤖 ${report.aiAugmented} שוחזרו ע״י AI` : ''
      const skipped = report.unmatched ? ` · דולגו ${report.unmatched} הזמנות שלא תאמו טיול קיים` : ''
      if (report.aiQuotaExceeded) {
        const more = report.aiSkipped ? ` · ${report.aiSkipped} לא נסרקו ע״י AI` : ''
        setToast({ kind: 'err', text: `⚠️ מכסת Gemini החינמית הסתיימה — נסה שוב בעוד דקה־שתיים. ${summary}${more}` })
      } else {
        setToast({ kind: 'ok', text: `📧 ${summary} (סרקתי ${report.scanned} מיילים${ai}${skipped})` })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאה'
      const isQuota = /\b429\b|quota|rate.?limit/i.test(msg)
      setToast({
        kind: 'err',
        text: isQuota
          ? '⚠️ מכסת Gemini החינמית (15/דקה או 1500/יום) הסתיימה. נסה שוב בעוד דקה־שתיים, או מחר אם זו המכסה היומית.'
          : msg.slice(0, 200),
      })
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
        </Toast>
      )}
    </>
  )
}
