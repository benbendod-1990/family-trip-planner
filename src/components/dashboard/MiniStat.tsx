import styled from 'styled-components'
import type { ReactNode } from 'react'

interface Props {
  title: string
  value: string | number
  description?: string
  icon: ReactNode
  color?: string
}

const Wrap = styled.div<{ $color: string }>`
  position: relative;
  min-width: 0;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  overflow: hidden;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
`

const Title = styled.div`
  font-size: 11px;
  color: #8b949e;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
`

const IconBox = styled.div<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: ${({ $color }) => $color}22;
  color: ${({ $color }) => $color};
  flex-shrink: 0;
`

const Value = styled.div<{ $color: string }>`
  font-size: clamp(16px, 5vw, 22px);
  font-weight: 800;
  line-height: 1.1;
  color: ${({ $color }) => $color};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`

const Desc = styled.div`
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`

export default function MiniStat({ title, value, description, icon, color = '#f59e0b' }: Props) {
  return (
    <Wrap $color={color}>
      <TopRow>
        <Title>{title}</Title>
        <IconBox $color={color}>{icon}</IconBox>
      </TopRow>
      <Value $color={color}>{value}</Value>
      {description && <Desc>{description}</Desc>}
    </Wrap>
  )
}
