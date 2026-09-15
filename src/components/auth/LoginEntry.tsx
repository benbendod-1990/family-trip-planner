import styled from 'styled-components'
import AuthEntryScreen from '@/components/auth/AuthEntryScreen'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

/** Shared copy so /login and the signed-in preview cannot drift. */
export const LOGIN_TITLE = 'המסע של משפחת בן דוד'
export const LOGIN_SUBTITLE = 'יומן הטיולים המשפחתי — מסונכרן בין כולם'
export const LOGIN_FOOTNOTE = 'כניסה עם חשבון Google. רק אימייל ופרופיל.'

const Banner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`

const Hint = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.gray[600]};
`

const BackBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray[700]};
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;

  &:hover {
    color: ${({ theme }) => theme.colors.gray[900]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 3px;
  }
`

interface Props {
  preview?: boolean
  onSignIn?: () => void
  onBack?: () => void
}

/** The branded Google login card. Preview disables the CTA so a signed-in
 *  user can look at the design without kicking off another OAuth round. */
export default function LoginEntry({ preview, onSignIn, onBack }: Props) {
  return (
    <AuthEntryScreen
      title={LOGIN_TITLE}
      subtitle={LOGIN_SUBTITLE}
      footnote={LOGIN_FOOTNOTE}
      banner={
        preview ? (
          <Banner>
            <Hint>תצוגה בלבד</Hint>
            <BackBtn type="button" onClick={onBack}>
              חזרה
            </BackBtn>
          </Banner>
        ) : undefined
      }
    >
      <GoogleSignInButton
        disabled={preview}
        title={preview ? 'תצוגה בלבד' : undefined}
        onClick={() => {
          if (preview) return
          onSignIn?.()
        }}
      >
        התחברות עם Google
      </GoogleSignInButton>
    </AuthEntryScreen>
  )
}
