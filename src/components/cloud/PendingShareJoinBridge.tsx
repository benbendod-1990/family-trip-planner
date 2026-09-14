import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { isShareToken, joinPathForToken, peekPendingShareToken } from '@/lib/tripShareLink'

/** After Google OAuth lands on `/`, bounce back to the pending /join/<token>. */
export default function PendingShareJoinBridge() {
  const { loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (location.pathname.startsWith('/join/')) return
    const token = peekPendingShareToken()
    if (!isShareToken(token)) return
    navigate(joinPathForToken(token), { replace: true })
  }, [loading, location.pathname, navigate])

  return null
}
