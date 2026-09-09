import styled from 'styled-components'
import { formatDateShort } from '@/utils/date'
import type { TripSegment } from '@/lib/tripMapSegments'
import { destinationColor } from '@/theme/warmTheme'

interface Props {
  segments: TripSegment[]
  onSelectDay: (dayId: string) => void
  onSelectPoiKey?: (key: string) => void
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  @media (min-width: 700px) {
    grid-template-columns: 1fr 1fr;
  }
`

const Card = styled.button`
  text-align: right;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.white};
  border-radius: 16px;
  padding: 12px 14px;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
`

const Num = styled.span<{ $bg: string; $fg: string }>`
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
`

const Dates = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const Title = styled.span`
  font-size: 16px;
  font-weight: 700;
`

const Item = styled.div`
  display: flex;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
  padding: 3px 0;
  color: ${({ theme }) => theme.colors.gray[800]};
`

export default function SegmentCards({ segments, onSelectDay, onSelectPoiKey }: Props) {
  return (
    <Grid>
      {segments.map(seg => {
        const color = destinationColor(seg.index - 1)
        const dateLabel = seg.startDate === seg.endDate
          ? formatDateShort(seg.startDate)
          : `${formatDateShort(seg.startDate)} – ${formatDateShort(seg.endDate)}`
        return (
          <Card
            key={seg.id}
            type="button"
            onClick={() => { if (seg.dayIds[0]) onSelectDay(seg.dayIds[0]) }}
          >
            <Head>
              <Num $bg="#1E3A5F" $fg="#fff">{seg.index}</Num>
              <Dates>{dateLabel}</Dates>
              <Title style={{ color: color.fg }}>{seg.title}</Title>
            </Head>
            {seg.items.map((item, i) => (
              <Item
                key={`${seg.id}-${i}`}
                onClick={e => {
                  if (!item.poiKey || !onSelectPoiKey) return
                  e.stopPropagation()
                  onSelectPoiKey(item.poiKey)
                }}
              >
                <span>{item.emoji}</span>
                <span>{item.text}</span>
              </Item>
            ))}
          </Card>
        )
      })}
    </Grid>
  )
}
