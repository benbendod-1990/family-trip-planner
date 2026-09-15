import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import styled, { css } from 'styled-components'
import { Plane } from 'lucide-react'
import { warmDisplayFont, warmPageBackground } from '@/theme/warmTheme'

const PageBg = styled.div`
  min-height: 100vh;
  background:
    radial-gradient(ellipse 90% 48% at 50% -8%, rgba(237, 179, 92, 0.22), transparent 58%),
    radial-gradient(ellipse 55% 40% at 108% 108%, rgba(181, 99, 15, 0.07), transparent 52%),
    ${warmPageBackground};
`

const Card = styled.section`
  position: relative;
  margin: 16px 0 20px;
  padding: 22px 18px 18px;
  background:
    linear-gradient(180deg, rgba(255, 253, 247, 0.92), rgba(255, 253, 247, 0.98)),
    ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 24px;
  box-shadow:
    0 1px 2px rgba(120, 90, 40, 0.06),
    0 18px 40px rgba(80, 56, 20, 0.10);

  @media (min-width: 768px) {
    margin: 24px 0 28px;
    padding: 28px 24px 22px;
  }
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

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const Mark = styled.div`
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  color: ${({ theme }) => theme.colors.primary[600]};
  background: ${({ theme }) => theme.colors.primary[50]};
  border: 1px solid ${({ theme }) => theme.colors.primary[100]};
  box-shadow: 0 1px 0 rgba(255, 253, 247, 0.9) inset;
`

const Title = styled.h1`
  font-family: ${warmDisplayFont};
  font-weight: 500;
  font-size: clamp(24px, 6.4vw, 30px);
  line-height: 1.28;
  margin: 0;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Subtitle = styled.p`
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.gray[500]};
`

const Hairline = styled.div`
  width: 48px;
  height: 2px;
  margin: 14px 0 12px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.primary[400]};
  opacity: 0.7;
`

const focusRing = css`
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 3px;
  }
`

const press = css`
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:disabled {
    opacity: 0.65;
    cursor: default;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:active:not(:disabled) { transform: none; }
  }
`

const AdminBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  padding: 8px 12px;
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.gray[50]};
  color: ${({ theme }) => theme.colors.gray[700]};
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  ${focusRing}
  ${press}

  svg { color: ${({ theme }) => theme.colors.primary[600]}; }
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.white};
  }
`

const Toolbar = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
`

const ToolBtn = styled.button`
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 72px;
  padding: 10px 6px;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.gray[800]};
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  touch-action: manipulation;
  box-shadow: 0 1px 2px rgba(120, 90, 40, 0.06);
  ${focusRing}
  ${press}

  svg { color: ${({ theme }) => theme.colors.primary[600]}; }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray[50]};
    box-shadow: 0 2px 4px rgba(120, 90, 40, 0.08);
  }

  @media (min-width: 640px) {
    flex-direction: row;
    min-height: 48px;
    gap: 8px;
    padding: 10px 12px;
  }
`

const CtaRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
`

const ctaBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 12px 14px;
  border-radius: 14px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  ${focusRing}
  ${press}
`

const PrimaryBtn = styled.button`
  ${ctaBase}
  flex: 1.45 1 0;
  border: 1px solid ${({ theme }) => theme.colors.primary[600]};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  box-shadow: 0 8px 20px rgba(181, 99, 15, 0.22);

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`

const SecondaryBtn = styled.button`
  ${ctaBase}
  flex: 1 1 0;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.gray[800]};
  box-shadow: 0 1px 2px rgba(120, 90, 40, 0.06);

  svg { color: ${({ theme }) => theme.colors.primary[600]}; }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray[50]};
  }
`

const ConnectBtn = styled.button`
  ${ctaBase}
  width: 100%;
  max-width: 360px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.gray[900]};
  box-shadow:
    0 1px 2px rgba(120, 90, 40, 0.06),
    0 8px 20px rgba(80, 56, 20, 0.08);

  svg { color: ${({ theme }) => theme.colors.primary[600]}; }

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray[50]};
  }
`

const SyncSlot = styled.div<{ $tall?: boolean }>`
  min-height: ${({ $tall }) => ($tall ? '72px' : '48px')};
  width: 100%;
`

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement>

export function HomePageBg({ children, className }: { children: ReactNode; className?: string }) {
  return <PageBg className={className}>{children}</PageBg>
}

export function HomeHeaderCard({ children }: { children: ReactNode }) {
  return (
    <Card dir="rtl">
      <Tape aria-hidden />
      {children}
    </Card>
  )
}

export function HomePlaneMark() {
  return (
    <Mark aria-hidden>
      <Plane size={22} strokeWidth={2} />
    </Mark>
  )
}

export function HomeTitle({ children }: { children: ReactNode }) {
  return <Title>{children}</Title>
}

export function HomeSubtitle({ children }: { children: ReactNode }) {
  return <Subtitle>{children}</Subtitle>
}

export function HomeTitleRow({ children }: { children: ReactNode }) {
  return <TitleRow>{children}</TitleRow>
}

export function HomeHairline() {
  return <Hairline aria-hidden />
}

export function HomeAdminLink(props: BtnProps) {
  return <AdminBtn type="button" {...props} />
}

export function HomeToolbar({
  cols = 3,
  children,
  ...rest
}: { cols?: number; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <Toolbar $cols={cols} {...rest}>
      {children}
    </Toolbar>
  )
}

export function HomeToolAction({
  icon,
  children,
  ...rest
}: BtnProps & { icon: ReactNode }) {
  return (
    <ToolBtn type="button" {...rest}>
      {icon}
      <span>{children}</span>
    </ToolBtn>
  )
}

export function HomeCtaRow({ children }: { children: ReactNode }) {
  return <CtaRow>{children}</CtaRow>
}

export function HomePrimaryButton(props: BtnProps) {
  return <PrimaryBtn type="button" {...props} />
}

export function HomeSecondaryButton(props: BtnProps) {
  return <SecondaryBtn type="button" {...props} />
}

export function HomeConnectButton(props: BtnProps) {
  return <ConnectBtn type="button" {...props} />
}

export function HomeSyncSlot({ tall }: { tall?: boolean }) {
  return <SyncSlot $tall={tall} />
}
