import styled from 'styled-components'

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 12px 18px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.gray[900]};
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  touch-action: manipulation;
  box-shadow:
    0 1px 2px rgba(120, 90, 40, 0.06),
    0 8px 20px rgba(80, 56, 20, 0.08);
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray[50]};
    box-shadow:
      0 2px 4px rgba(120, 90, 40, 0.08),
      0 12px 24px rgba(80, 56, 20, 0.12);
  }

  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  &:disabled {
    opacity: 0.65;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:active:not(:disabled) { transform: none; }
  }
`

const Glyph = styled.span`
  display: inline-flex;
  flex-shrink: 0;
`

/** Official four-color Google G — keeps the CTA recognizable without a stock widget. */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-1.026 3.011-3.29 5.44-6.084 6.57l.001-.001 6.19 5.238C39.212 35.971 44 30.687 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}

interface Props {
  onClick: () => void
  disabled?: boolean
  children?: string
}

export default function GoogleSignInButton({
  onClick,
  disabled,
  children = 'התחברות עם Google',
}: Props) {
  return (
    <Btn type="button" onClick={onClick} disabled={disabled}>
      <Glyph>
        <GoogleG />
      </Glyph>
      <span>{children}</span>
    </Btn>
  )
}
