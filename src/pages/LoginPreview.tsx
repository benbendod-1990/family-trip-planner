import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import LoginEntry from '@/components/auth/LoginEntry'

/** Signed-in look at the branded login card. Any authenticated user — not
 *  family-catalog admins only. Guests already see the real /login. */
export default function LoginPreview() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return <LoginEntry preview onBack={() => navigate('/')} />
}
