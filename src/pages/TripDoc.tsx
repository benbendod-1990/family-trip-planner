import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stack, Typography, Button, EmptyState, Spinner } from 'myk-library'
import { FileText, BookOpen } from 'lucide-react'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { fetchDocText } from '@/lib/tripDoc'
import TripDocCard from '@/components/dashboard/TripDocCard'

const PageWrapper = styled.div<{ $mobile: boolean }>`
  padding: ${({ $mobile }) => ($mobile ? '12px' : '24px')};
  display: flex;
  flex-direction: column;
  gap: 24px;
`

/*
 * The Doc is prose, so it is shown as-is rather than parsed — the point is to
 * read the source of truth without leaving the app (and without Google's
 * mobile Docs app, which is heavy on a phone mid-trip).
 */
const DocText = styled.pre`
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
  padding: 16px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  max-height: 70vh;
  overflow: auto;
`

export default function TripDoc() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()

  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!trip) return null

  const read = async () => {
    if (!trip.docUrl) return
    setBusy(true)
    setError(null)
    try {
      setText(await fetchDocText(trip.docUrl))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'קריאת המסמך נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageWrapper $mobile={isMobile}>
      <Stack direction="row" align="center" spacing="sm">
        <Typography variant="h4" style={{ margin: 0 }}>📄 מסמך התכנון</Typography>
      </Stack>

      <TripDocCard trip={trip} />

      {trip.docUrl ? (
        <Stack direction="column" spacing="md">
          {!text && (
            <Button onClick={read} disabled={busy}>
              <Stack direction="row" spacing="xs" align="center" justify="center">
                {busy ? <Spinner size="sm" /> : <BookOpen size={16} />}
                <span>{busy ? 'קורא את המסמך…' : 'קרא את המסמך כאן'}</span>
              </Stack>
            </Button>
          )}
          {error && (
            <Typography variant="body2" style={{ color: '#b91c1c' }}>{error}</Typography>
          )}
          {text && <DocText>{text}</DocText>}
        </Stack>
      ) : (
        <EmptyState
          icon={<FileText size={40} />}
          title="לא מקושר מסמך"
          description="קשרו קישור למסמך התכנון כדי לקרוא אותו כאן ולהשוות מולו את לוח הזמנים."
        />
      )}
    </PageWrapper>
  )
}
