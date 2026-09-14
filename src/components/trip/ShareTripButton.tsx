import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2 } from 'lucide-react'
import styled from 'styled-components'
import {
  copyAndShareTripLink,
  copyText,
  shareLinkFailureStatus,
  tripShareJoinUrl,
  whatsappShareHref,
} from '@/lib/tripShareLink'

interface Props {
  tripId: string
  tripName: string
}

type ToastKind = 'ok' | 'err' | 'info'

type ToastState = {
  kind: ToastKind
  text: string
  url?: string
}

const ShareHit = styled.button<{ $busy: boolean }>`
  appearance: none;
  border: none;
  background: ${({ $busy }) => ($busy ? 'rgba(5, 150, 105, 0.14)' : 'transparent')};
  color: #059669;
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: ${({ $busy }) => ($busy ? 'wait' : 'pointer')};
  padding: 0;
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(5, 150, 105, 0.25);
  &:disabled { opacity: 0.6; }
  &:active { background: rgba(5, 150, 105, 0.18); }
`

const Toast = styled.div<{ $kind: ToastKind }>`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ $kind }) =>
    $kind === 'ok' ? '#059669' : $kind === 'err' ? '#dc2626' : '#3b82f6'};
  color: #fff;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1200;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  max-width: min(92vw, 420px);
  text-align: center;
  direction: rtl;
  flex-wrap: wrap;
  justify-content: center;
`

const ToastBtn = styled.a`
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
`

const ToastCopy = styled.button`
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
`

const ToastDismiss = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
`

function stopCard(e: React.SyntheticEvent) {
  e.stopPropagation()
  const native = e.nativeEvent as Event & { stopImmediatePropagation?: () => void }
  native.stopImmediatePropagation?.()
}

/**
 * Home-safe: tripRepo (Supabase) loads only after a deliberate tap.
 * Native <button> — myk-library ActionIcon on a hoverable Card was a silent
 * no-op on iPhone: after awaiting the RPC, clipboard/share lose the user
 * gesture, and the old UI only wrote the result into `title` (invisible on
 * mobile). Toast + WhatsApp/copy actions give a fresh gesture.
 */
export default function ShareTripButton({ tripId, tripName }: Props) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!toast) return
    const ms = toast.url ? 8000 : toast.kind === 'err' ? 5500 : 4000
    const t = window.setTimeout(() => setToast(null), ms)
    return () => window.clearTimeout(t)
  }, [toast])

  const onShare = async (e: React.MouseEvent) => {
    e.preventDefault()
    stopCard(e)
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setToast({ kind: 'info', text: 'מכין לינק שיתוף…' })
    try {
      const { createOrGetTripShareLink } = await import('@/lib/tripRepo')
      const link = await createOrGetTripShareLink(tripId)
      const url = tripShareJoinUrl(link.token)
      const result = await copyAndShareTripLink({ url, tripName })
      if (result === 'shared') {
        setToast({ kind: 'ok', text: '✓ נפתח שיתוף — הלינק מוכן' })
      } else if (result === 'copied') {
        setToast({
          kind: 'ok',
          text: '✓ הלינק הועתק — אפשר לשלוח בוואטסאפ',
          url,
        })
      } else {
        setToast({
          kind: 'err',
          text: 'לא הצלחנו להעתיק אוטומטית. העתיקו או שלחו בוואטסאפ.',
          url,
        })
      }
    } catch (err) {
      setToast({ kind: 'err', text: shareLinkFailureStatus(err) })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const onCopyAgain = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    const ok = await copyText(url)
    setToast({
      kind: ok ? 'ok' : 'err',
      text: ok ? '✓ הלינק הועתק' : 'לא הצלחנו להעתיק. לחצו לחיצה ארוכה על הלינק.',
      url,
    })
  }

  return (
    <>
      <ShareHit
        type="button"
        $busy={busy}
        disabled={busy}
        aria-label="שתף"
        title="שתף"
        onPointerDown={stopCard}
        onMouseDown={stopCard}
        onClick={e => { void onShare(e) }}
      >
        <Share2 size={14} aria-hidden />
      </ShareHit>
      {toast && typeof document !== 'undefined' && createPortal(
        <Toast $kind={toast.kind} role="status" aria-live="polite" onClick={e => e.stopPropagation()}>
          <span>{toast.text}</span>
          {toast.url && (
            <>
              <ToastCopy type="button" onClick={e => { void onCopyAgain(e, toast.url!) }}>
                העתק
              </ToastCopy>
              <ToastBtn
                href={whatsappShareHref({ url: toast.url, tripName })}
                target="_blank"
                rel="noopener noreferrer"
              >
                וואטסאפ
              </ToastBtn>
            </>
          )}
          <ToastDismiss type="button" aria-label="סגור" onClick={e => { e.stopPropagation(); setToast(null) }}>
            ✕
          </ToastDismiss>
        </Toast>,
        document.body,
      )}
    </>
  )
}
