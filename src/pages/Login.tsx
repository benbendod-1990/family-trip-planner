import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { joinPathForToken, peekPendingShareToken } from '@/lib/tripShareLink'
import LoginEntry from '@/components/auth/LoginEntry'

export default function Login() {
  const { session, loading, signInWithGoogle } = useAuth()

  if (loading) return null
  if (session) {
    const pending = peekPendingShareToken()
    if (pending) return <Navigate to={joinPathForToken(pending)} replace />
    return <Navigate to="/" replace />
  }

  return <LoginEntry onSignIn={() => void signInWithGoogle()} />
}
