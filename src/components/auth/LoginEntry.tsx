import AuthEntryScreen from '@/components/auth/AuthEntryScreen'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export const LOGIN_TITLE = 'המסע של משפחת בן דוד'
export const LOGIN_SUBTITLE = 'יומן הטיולים המשפחתי — מסונכרן בין כולם'
export const LOGIN_FOOTNOTE = 'כניסה עם חשבון Google. רק אימייל ופרופיל.'

interface Props {
  onSignIn: () => void
}

/** The branded Google login card used by /login. */
export default function LoginEntry({ onSignIn }: Props) {
  return (
    <AuthEntryScreen
      title={LOGIN_TITLE}
      subtitle={LOGIN_SUBTITLE}
      footnote={LOGIN_FOOTNOTE}
    >
      <GoogleSignInButton onClick={onSignIn}>
        התחברות עם Google
      </GoogleSignInButton>
    </AuthEntryScreen>
  )
}
