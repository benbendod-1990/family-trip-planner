import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { useAuth } from '@/lib/AuthContext'
import {
  clearPendingShareToken,
  isShareToken,
  joinPathForToken,
  shareLinkFailureStatus,
  stashPendingShareToken,
} from '@/lib/tripShareLink'
import AuthEntryScreen from '@/components/auth/AuthEntryScreen'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

const GhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray[600]};
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  touch-action: manipulation;

  &:hover {
    color: ${({ theme }) => theme.colors.gray[800]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 3px;
    border-radius: 10px;
  }
`

const Status = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const ErrorText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #b45309;
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
      <AuthEntryScreen
        mark="🔗"
        title="לינק שיתוף לא תקין"
        subtitle="בקשו מבעל הטיול לינק חדש."
      >
        <GhostButton type="button" onClick={onDecline}>חזרה הביתה</GhostButton>
      </AuthEntryScreen>
    )
  }

  const heading = peek?.trip_name ?? 'טיול משפחתי'
  const waiting = loading || peek === undefined || busy || (session && peek && !status)

  return (
    <AuthEntryScreen
      mark={peek?.cover_emoji ?? '🧳'}
      title="הוזמנת לטיול"
      lead={heading}
      subtitle={
        <>
          {peek?.destination ? <>{peek.destination}<br /></> : null}
          אחרי כניסה עם Google תראו רק את הטיול הזה, לא את כל הקטלוג המשפחתי.
        </>
      }
    >
      {status ? <ErrorText>{status}</ErrorText> : null}
      {waiting ? (
        <Status>
          {session && peek ? 'מצרפים אותך לטיול…' : 'טוען…'}
        </Status>
      ) : (
        <GoogleSignInButton
          onClick={() => void signInWithGoogle({ redirectPath: joinPathForToken(token) })}
        >
          התחברות עם Google
        </GoogleSignInButton>
      )}
      <GhostButton type="button" onClick={onDecline}>לא תודה</GhostButton>
    </AuthEntryScreen>
  )
}
