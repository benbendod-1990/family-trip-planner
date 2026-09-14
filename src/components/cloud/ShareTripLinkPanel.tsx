import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Button, Stack, Typography } from 'myk-library'
import { Copy, Share2, RefreshCw, Ban } from 'lucide-react'
import {
  createOrGetTripShareLink,
  getTripShareLink,
  regenerateTripShareLink,
  revokeTripShareLink,
  type TripShareLink,
} from '@/lib/tripRepo'
import {
  copyAndShareTripLink,
  formatShareExpiry,
  shareLinkFailureStatus,
  tripShareJoinUrl,
} from '@/lib/tripShareLink'

const UrlBox = styled.div`
  direction: ltr;
  text-align: left;
  font-size: 12px;
  word-break: break-all;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  color: #374151;
`

interface Props {
  tripId: string
  tripName: string
}

export default function ShareTripLinkPanel({ tripId, tripName }: Props) {
  const [link, setLink] = useState<TripShareLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    void getTripShareLink(tripId)
      .then(next => {
        if (!cancelled) setLink(next)
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatus(shareLinkFailureStatus(e))
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  const flash = (text: string) => {
    setStatus(text)
  }

  const publish = async (next: TripShareLink, nativeShare: boolean) => {
    const url = tripShareJoinUrl(next.token)
    if (!nativeShare) {
      const { copyText } = await import('@/lib/tripShareLink')
      const ok = await copyText(url)
      flash(ok ? '✓ הלינק הועתק' : 'לא הצלחנו להעתיק. העתיקו ידנית.')
      return
    }
    const result = await copyAndShareTripLink({ url, tripName })
    flash(result === 'failed' ? 'לא הצלחנו להעתיק. העתיקו ידנית.' : '✓ הלינק הועתק — אפשר לשלוח בוואטסאפ')
  }

  const onCreateOrCopy = async (nativeShare: boolean) => {
    setBusy(true)
    setStatus('')
    try {
      const next = link ?? await createOrGetTripShareLink(tripId)
      setLink(next)
      await publish(next, nativeShare)
    } catch (e) {
      flash(shareLinkFailureStatus(e))
    } finally {
      setBusy(false)
    }
  }

  const onRegenerate = async () => {
    if (!confirm('לינק ישן יפסיק לעבוד. ליצור לינק חדש?')) return
    setBusy(true)
    setStatus('')
    try {
      const next = await regenerateTripShareLink(tripId)
      setLink(next)
      await publish(next, false)
    } catch (e) {
      flash(shareLinkFailureStatus(e))
    } finally {
      setBusy(false)
    }
  }

  const onRevoke = async () => {
    if (!confirm('לבטל את לינק השיתוף? מי שעוד לא הצטרף לא יוכל לפתוח אותו.')) return
    setBusy(true)
    setStatus('')
    try {
      await revokeTripShareLink(tripId)
      setLink(null)
      flash('✓ הלינק בוטל')
    } catch (e) {
      flash(shareLinkFailureStatus(e))
    } finally {
      setBusy(false)
    }
  }

  const url = link ? tripShareJoinUrl(link.token) : ''
  const expiry = link ? formatShareExpiry(link.expires_at) : ''

  return (
    <div style={{ marginTop: 16 }}>
      <Typography variant="h6" style={{ marginBottom: 8 }}>לינק שיתוף (וואטסאפ)</Typography>
      <Typography variant="body2" style={{ color: '#6b7280', marginBottom: 8 }}>
        מי שיפתח את הלינק יצטרף רק לטיול הזה — לא לכל הטיולים המשפחתיים.
      </Typography>
      {url ? (
        <UrlBox>{url}</UrlBox>
      ) : (
        <Typography variant="body2" style={{ color: '#9ca3af' }}>
          עדיין אין לינק פעיל. צרו אחד והעתיקו.
        </Typography>
      )}
      {expiry && (
        <Typography variant="body2" style={{ color: '#6b7280', marginTop: 6 }}>
          בתוקף עד {expiry}
        </Typography>
      )}
      <Stack direction="row" spacing="sm" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={() => void onCreateOrCopy(true)} disabled={busy}>
          <Stack direction="row" spacing="xs" align="center">
            <Share2 size={16} />
            <span>שתף</span>
          </Stack>
        </Button>
        <Button variant="ghost" onClick={() => void onCreateOrCopy(false)} disabled={busy}>
          <Stack direction="row" spacing="xs" align="center">
            <Copy size={16} />
            <span>העתק לינק</span>
          </Stack>
        </Button>
      </Stack>
      {link && (
        <Stack direction="row" spacing="sm" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => void onRegenerate()} disabled={busy}>
            <Stack direction="row" spacing="xs" align="center">
              <RefreshCw size={14} />
              <span>חדש לינק</span>
            </Stack>
          </Button>
          <Button variant="ghost" onClick={() => void onRevoke()} disabled={busy}>
            <Stack direction="row" spacing="xs" align="center">
              <Ban size={14} />
              <span>בטל לינק</span>
            </Stack>
          </Button>
        </Stack>
      )}
      {status && (
        <Typography
          variant="body2"
          style={{ color: status.startsWith('✓') ? '#10b981' : '#ef4444', marginTop: 8 }}
        >
          {status}
        </Typography>
      )}
    </div>
  )
}
