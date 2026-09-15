import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { joinPathForToken, peekPendingShareToken } from '@/lib/tripShareLink'
import AuthEntryScreen from '@/components/auth/AuthEntryScreen'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export default function Login() {
  const { session, loading, signInWithGoogle } = useAuth()

  if (loading) return null
  if (session) {
    const pending = peekPendingShareToken()
    if (pending) return <Navigate to={joinPathForToken(pending)} replace />
    return <Navigate to="/" replace />
  }

  return (
    <AuthEntryScreen
      title="המסע של משפחת בן דוד"
      subtitle="יומן הטיולים המשפחתי — מסונכרן בין כולם"
      footnote="כניסה עם חשבון Google. רק אימייל ופרופיל."
    >
      <GoogleSignInButton onClick={() => void signInWithGoogle()}>
        התחברות עם Google
      </GoogleSignInButton>
    </AuthEntryScreen>
  )
}
