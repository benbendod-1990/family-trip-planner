import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { Button, Container, Stack, Typography } from 'myk-library'
import { useAuth } from '@/lib/AuthContext'
import {
  clearPendingShareToken,
  isShareToken,
  joinPathForToken,
  shareLinkFailureStatus,
  stashPendingShareToken,
} from '@/lib/tripShareLink'

const Wrap = styled.div`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px 16px;
`

const Card = styled.div`
  background: #fff;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 16px;
  padding: 32px;
  max-width: 420px;
  width: 100%;
  text-align: center;
`

interface PeekInfo {
  trip_id: string
  trip_name: string
  destination: string
  cover_emoji: string
}

async function openClaimedTrip(tripId: string) {
  const [
    { listTrips, foldRemoteTrips },
    { dropUnauthorizedDemoSeeds },
    { useTripStore },
  ] = await Promise.all([
    import('@/lib/tripRepo'),
    import('@/lib/authTripSync'),
    import('@/stores/tripStore'),
  ])
  const remote = await listTrips()
  const remoteIds = new Set(remote.map(t => t.id))
  const local = dropUnauthorizedDemoSeeds(useTripStore.getState().trips, remoteIds)
  const { trips } = foldRemoteTrips(local, remote)
  useTripStore.setState({ trips, activeTripId: tripId })
}

export default function JoinTrip() {
  const { token: rawToken } = useParams<{ token: string }>()
  const token = isShareToken(rawToken) ? rawToken : null
  const navigate = useNavigate()
  const { session, loading, signInWithGoogle } = useAuth()
  const [peek, setPeek] = useState<PeekInfo | null | undefined>(undefined)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const claiming = useRef(false)

  useEffect(() => {
    if (!token) {
      clearPendingShareToken()
      return
    }
    stashPendingShareToken(token)
    let cancelled = false
    void import('@/lib/tripRepo')
      .then(({ peekTripShareLink }) => peekTripShareLink(token))
      .then(next => {
        if (cancelled) return
        if (!next) {
          setPeek(null)
          setStatus('הלינק לא תקין או שפג תוקפו.')
          return
        }
        setPeek(next)
        setStatus('')
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPeek(null)
          setStatus(shareLinkFailureStatus(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (loading || !session || !token || !peek || claiming.current) return
    let cancelled = false
    claiming.current = true
    void (async () => {
      try {
        const { claimTripShareLink } = await import('@/lib/tripRepo')
        if (cancelled) return
        setBusy(true)
        const claimed = await claimTripShareLink(token)
        if (cancelled) return
        await openClaimedTrip(claimed.trip_id)
        if (cancelled) return
        clearPendingShareToken()
        navigate(`/trip/${claimed.trip_id}/dashboard`, { replace: true })
      } catch (e) {
        claiming.current = false
        if (!cancelled) {
          setBusy(false)
          setStatus(shareLinkFailureStatus(e))
        }
      }
    })()
    return () => {
      cancelled = true
      claiming.current = false
    }
  }, [loading, navigate, peek, session, token])

  const onDecline = () => {
    clearPendingShareToken()
    navigate('/', { replace: true })
  }

  if (!token) {
    return (
      <Container>
        <Wrap>
          <Card dir="rtl">
            <Stack direction="column" spacing="lg" align="center">
              <div style={{ fontSize: 48 }}>🔗</div>
              <Typography variant="h2">לינק שיתוף לא תקין</Typography>
              <Typography variant="body1" style={{ color: '#6b7280' }}>
                בקשו מבעל הטיול לינק חדש.
              </Typography>
              <Button variant="primary" onClick={onDecline}>חזרה הביתה</Button>
            </Stack>
          </Card>
        </Wrap>
      </Container>
    )
  }

  const heading = peek?.trip_name ?? 'טיול משפחתי'

  return (
    <Container>
      <Wrap>
        <Card dir="rtl">
          <Stack direction="column" spacing="lg" align="center">
            <div style={{ fontSize: 48 }}>{peek?.cover_emoji ?? '🧳'}</div>
            <Typography variant="h2">הוזמנת לטיול</Typography>
            <Typography variant="h5" style={{ margin: 0 }}>{heading}</Typography>
            {peek?.destination && (
              <Typography variant="body2" style={{ color: '#6b7280' }}>
                {peek.destination}
              </Typography>
            )}
            <Typography variant="body1" style={{ color: '#6b7280' }}>
              אחרי כניסה עם Google תראו רק את הטיול הזה, לא את כל הקטלוג המשפחתי.
            </Typography>
            {status && (
              <Typography variant="body2" style={{ color: '#ef4444' }}>{status}</Typography>
            )}
            {loading || peek === undefined || busy || (session && peek && !status) ? (
              <Typography variant="body2" style={{ color: '#6b7280' }}>
                {session && peek ? 'מצרפים אותך לטיול…' : 'טוען…'}
              </Typography>
            ) : (
              <Button
                variant="primary"
                onClick={() => void signInWithGoogle({ redirectPath: joinPathForToken(token) })}
              >
                התחברות עם Google
              </Button>
            )}
            <Button variant="ghost" onClick={onDecline}>לא תודה</Button>
          </Stack>
        </Card>
      </Wrap>
    </Container>
  )
}
