import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { listTripMembers } from '@/lib/tripRepo'
import { userIsTripOwner } from '@/lib/tripOwnership'

/**
 * True only after a successful membership read that lists this user as
 * owner (or admin). Guests, invitees, and failed RPCs are not owners —
 * sync-check UI must stay hidden rather than flashing on.
 */
export function useIsTripOwner(tripId: string | undefined): { isOwner: boolean; loading: boolean } {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const [fetched, setFetched] = useState<{ tripId: string; userId: string; owner: boolean } | null>(null)

  useEffect(() => {
    if (!tripId || !userId) return
    let cancelled = false
    void listTripMembers(tripId)
      .then(members => {
        if (cancelled) return
        setFetched({ tripId, userId, owner: userIsTripOwner(userId, members) })
      })
      .catch(() => {
        if (cancelled) return
        setFetched({ tripId, userId, owner: false })
      })
    return () => {
      cancelled = true
    }
  }, [tripId, userId])

  if (!tripId || !userId) return { isOwner: false, loading: authLoading }
  const matched = fetched?.tripId === tripId && fetched?.userId === userId
  return { isOwner: matched ? fetched.owner : false, loading: authLoading || !matched }
}
