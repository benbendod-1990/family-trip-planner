import styled from 'styled-components'
import type { TripDay } from '@/types/trip'
import { formatDateShort } from '@/utils/date'

interface Props {
  days: TripDay[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

const Strip = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0 4px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const DayChip = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary[400] : theme.colors.gray[200])};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary[100] : theme.colors.white)};
  border-radius: 12px;
  padding: 6px 10px;
  font-family: inherit;
  cursor: pointer;
  min-width: 72px;
  color: inherit;
`

const DayChipDate = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const DayChipLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gray[600]};
  margin-top: 4px;
`

/**
 * Compact trip-day strip on the scrapbook map page.
 * Clicking a day opens that day's לו״ז on the itinerary page — not a month grid.
 */
export default function MiniTripCalendars({
  days,
  selectedDate,
  onSelectDate,
}: Props) {
  if (days.length === 0) return null

  return (
    <div>
      <Strip role="listbox" aria-label="ימי הטיול">
        {days.map((d, i) => {
          const active = d.date === selectedDate
          const label = d.label || `יום ${i + 1}`
          return (
            <DayChip
              key={d.id}
              type="button"
              role="option"
              $active={active}
              aria-selected={active}
              aria-label={`לו״ז ${label}`}
              onClick={() => onSelectDate(d.date)}
            >
              <DayChipDate>{formatDateShort(d.date)}</DayChipDate>
              <DayChipLabel>{label}</DayChipLabel>
            </DayChip>
          )
        })}
      </Strip>
      <Hint>לחיצה על יום פותחת את הלו״ז</Hint>
    </div>
  )
}
