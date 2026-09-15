import type { ReactNode } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import { warmTheme, warmDisplayFont, warmPageBackground } from '@/theme/warmTheme'

/** iPhone home-screen mark — 180px, lighter than icon-512, sharp at ~108 CSS px. */
const AUTH_BRAND_ICON_SRC = '/apple-touch-icon.png'
const AUTH_BRAND_NAME = 'המסע של משפחת בן דוד'

const Page = styled.div`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 28px 16px max(28px, env(safe-area-inset-bottom));
  background:
    radial-gradient(ellipse 90% 48% at 50% -8%, rgba(237, 179, 92, 0.28), transparent 58%),
    radial-gradient(ellipse 55% 40% at 108% 108%, rgba(181, 99, 15, 0.08), transparent 52%),
    ${warmPageBackground};
`

const Card = styled.section`
  position: relative;
  width: 100%;
  max-width: 400px;
  padding: 36px 26px 28px;
  text-align: center;
  background:
    linear-gradient(180deg, rgba(255, 253, 247, 0.92), rgba(255, 253, 247, 0.98)),
    ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 24px;
  box-shadow:
    0 1px 2px rgba(120, 90, 40, 0.06),
    0 18px 40px rgba(80, 56, 20, 0.10);
`

const Tape = styled.div`
  position: absolute;
  top: -10px;
  inset-inline-start: 22px;
  width: 72px;
  height: 22px;
  border-radius: 2px;
  background: repeating-linear-gradient(
    90deg,
    rgba(196, 92, 62, 0.55) 0 8px,
    rgba(196, 92, 62, 0.32) 8px 10px
  );
  box-shadow: 0 2px 4px rgba(80, 56, 20, 0.12);
  transform: rotate(-8deg);
  pointer-events: none;
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`

const MarkWrap = styled.div`
  width: 108px;
  height: 108px;
  border-radius: 28px;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(255, 253, 247, 0.9) inset,
    0 10px 24px rgba(80, 56, 20, 0.16);
`

const MarkImg = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const EmojiMark = styled.div`
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: 24px;
  font-size: 42px;
  line-height: 1;
  background: ${({ theme }) => theme.colors.gray[100]};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
`

const Title = styled.h1`
  font-family: ${warmDisplayFont};
  font-weight: 500;
  font-size: clamp(24px, 6vw, 30px);
  line-height: 1.28;
  margin: 4px 0 0;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Hairline = styled.div`
  width: 48px;
  height: 2px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.primary[400]};
  opacity: 0.7;
`

const Subtitle = styled.div`
  margin: 0;
  max-width: 34ch;
  font-size: 15px;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const AuthLead = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 18px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
  margin: -4px 0 0;
`

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
`

const Footnote = styled.p`
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.gray[400]};
`

function BrandMark() {
  return (
    <MarkWrap>
      <MarkImg
        src={AUTH_BRAND_ICON_SRC}
        width={180}
        height={180}
        alt={AUTH_BRAND_NAME}
      />
    </MarkWrap>
  )
}

interface CardProps {
  title: string
  lead?: ReactNode
  subtitle?: ReactNode
  mark?: 'brand' | ReactNode
  footnote?: ReactNode
  children?: ReactNode
}

export function AuthEntryCard({ title, lead, subtitle, mark = 'brand', footnote, children }: CardProps) {
  return (
    <Card dir="rtl">
      <Tape aria-hidden />
      <Body>
        {mark === 'brand' ? <BrandMark /> : mark ? <EmojiMark>{mark}</EmojiMark> : null}
        <Title>{title}</Title>
        {lead ? <AuthLead>{lead}</AuthLead> : null}
        <Hairline aria-hidden />
        {subtitle ? <Subtitle>{subtitle}</Subtitle> : null}
        {children ? <Actions>{children}</Actions> : null}
        {footnote ? <Footnote>{footnote}</Footnote> : null}
      </Body>
    </Card>
  )
}

interface ScreenProps extends CardProps {
  children?: ReactNode
}

/** Full-viewport cream gate. Login and Join wrap with warmTheme so they
 *  don't inherit the inverted tripTheme from main.tsx. */
export default function AuthEntryScreen(props: ScreenProps) {
  return (
    <ThemeProvider theme={warmTheme}>
      <Page className="warm-shell">
        <AuthEntryCard {...props} />
      </Page>
    </ThemeProvider>
  )
}
