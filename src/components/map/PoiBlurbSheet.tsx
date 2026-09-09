import styled from 'styled-components'
import { ExternalLink, X } from 'lucide-react'
import { warmDisplayFont } from '@/theme/warmTheme'
import { formatDateShort } from '@/utils/date'

export interface BlurbTarget {
  name: string
  emoji: string
  blurb: string
  linkUrl?: string
  linkLabel?: string
  dayDates?: string[]
}

interface Props {
  target: BlurbTarget
  mobile: boolean
  onClose: () => void
}

const Panel = styled.aside<{ $mobile: boolean }>`
  position: fixed;
  z-index: 40;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: 16px 18px 18px;
  ${({ $mobile }) =>
    $mobile
      ? `
        left: 10px;
        right: 10px;
        bottom: 12px;
        border-radius: 16px;
        max-height: 42%;
        overflow-y: auto;
      `
      : `
        top: 88px;
        inset-inline-start: 24px;
        width: min(360px, calc(100% - 48px));
        border-radius: 16px;
      `}
`

const Title = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 20px;
  font-weight: 500;
`

const Blurb = styled.p`
  margin: 8px 0 12px;
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const LinkBtn = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 999px;
  text-decoration: none;
  &:hover { filter: brightness(0.95); }
`

const CloseBtn = styled.button`
  position: absolute;
  top: 10px;
  inset-inline-end: 10px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray[500]};
  cursor: pointer;
  padding: 4px;
`

const Dates = styled.div`
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 10px;
`

export default function PoiBlurbSheet({ target, mobile, onClose }: Props) {
  return (
    <Panel $mobile={mobile} dir="rtl">
      <CloseBtn type="button" onClick={onClose} aria-label="סגור">
        <X size={16} />
      </CloseBtn>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineEnd: 20 }}>
        <span style={{ fontSize: 28 }}>{target.emoji}</span>
        <Title>{target.name}</Title>
      </div>
      <Blurb>{target.blurb}</Blurb>
      {target.dayDates && target.dayDates.length > 0 && (
        <Dates>בלו״ז: {target.dayDates.map(d => formatDateShort(d)).join(' · ')}</Dates>
      )}
      {target.linkUrl && (
        <LinkBtn href={target.linkUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} />
          {target.linkLabel ?? 'Google Maps'}
        </LinkBtn>
      )}
    </Panel>
  )
}
