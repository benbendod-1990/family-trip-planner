import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { ActionIcon } from 'myk-library'
import {
  copyAndShareTripLink,
  shareLinkFailureStatus,
  tripShareJoinUrl,
} from '@/lib/tripShareLink'

interface Props {
  tripId: string
  tripName: string
}

/** Home-safe: tripRepo (Supabase) loads only after a deliberate tap. */
export default function ShareTripButton({ tripId, tripName }: Props) {
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('שתף')

  const onShare = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const { createOrGetTripShareLink } = await import('@/lib/tripRepo')
      const link = await createOrGetTripShareLink(tripId)
      const url = tripShareJoinUrl(link.token)
      const result = await copyAndShareTripLink({ url, tripName })
      setTitle(result === 'failed' ? 'לא הצלחנו להעתיק' : 'הלינק הועתק')
      window.setTimeout(() => setTitle('שתף'), 2500)
    } catch (err) {
      setTitle(shareLinkFailureStatus(err))
      window.setTimeout(() => setTitle('שתף'), 3500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ActionIcon
      variant="subtle"
      size="sm"
      onClick={(e: React.MouseEvent) => { void onShare(e) }}
      title={title}
      aria-label="שתף"
      disabled={busy}
      style={{ color: '#059669' }}
    >
      <Share2 size={14} />
    </ActionIcon>
  )
}
