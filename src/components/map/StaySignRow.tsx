import styled from 'styled-components'
import type { FrontStay } from '@/lib/tripFrontPoster'
import { warmDisplayFont } from '@/theme/warmTheme'

interface Props {
  stays: FrontStay[]
}

const Row = styled.div`
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 6px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const Board = styled.div`
  flex: 0 0 auto;
  min-width: 132px;
  max-width: 168px;
  background:
    linear-gradient(180deg, #D7B27A 0%, #B8894E 55%, #9A6E38 100%);
  border: 3px solid #6B4F32;
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 2px rgba(244, 226, 186, 0.45),
    0 3px 8px rgba(42, 32, 19, 0.18);
  padding: 8px 10px 9px;
  color: #2A2013;
`

const Dates = styled.div`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
`

const Name = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 14px;
  font-weight: 500;
  line-height: 1.25;
  margin-top: 2px;
`

export default function StaySignRow({ stays }: Props) {
  if (stays.length === 0) return null
  return (
    <Row aria-label="לינות">
      {stays.map(stay => (
        <Board key={stay.id}>
          <Dates>{stay.dateRange}</Dates>
          <Name>{stay.name}</Name>
        </Board>
      ))}
    </Row>
  )
}
