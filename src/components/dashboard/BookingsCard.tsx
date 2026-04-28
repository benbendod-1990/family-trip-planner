import styled from 'styled-components'
import { Card } from 'myk-library'
import { Plane, Hotel, Car } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { TripPlan } from '@/types/trip-plan'
import { formatCurrency } from '@/utils/currency'

interface Props {
  trip: TripPlan
}

const Wrap = styled(Card)`
  padding: 16px;
`

const Title = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
`

const Cell = styled.button<{ $ok: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  border-radius: 12px;
  background: ${({ $ok }) => $ok ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.06)'};
  border: 1px solid ${({ $ok }) => $ok ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.2)'};
  cursor: pointer;
  text-align: right;
  font-family: inherit;
  color: inherit;
  min-height: 44px;
  transition: transform 120ms ease, background 120ms ease;
  &:hover { background: ${({ $ok }) => $ok ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.12)'}; }
  &:active { transform: scale(0.98); }
`

const Top = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
`

const Label = styled.span`
  font-size: 12px;
  color: #8b949e;
  font-weight: 600;
`

const Value = styled.div`
  font-size: 18px;
  font-weight: 800;
  color: #f0f6fc;
  line-height: 1.1;
`

const Sub = styled.div`
  font-size: 11px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const IconWrap = styled.div<{ $ok: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ $ok }) => $ok ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)'};
  color: ${({ $ok }) => $ok ? '#10b981' : '#f59e0b'};
`

export default function BookingsCard({ trip }: Props) {
  const navigate = useNavigate()
  const totalFlights = trip.flights.length
  const totalAcc = trip.accommodations.length
  const totalCars = (trip.carRentals ?? []).length

  const flightCost = trip.flights.reduce((s, f) => s + (f.cost ?? 0), 0)
  const accCost = trip.accommodations.reduce((s, a) => s + (a.cost ?? 0), 0)
  const carCost = (trip.carRentals ?? []).reduce((s, c) => s + (c.cost ?? 0), 0)

  const fmt = (n: number, currency: string) => n > 0 ? formatCurrency(n, currency) : '—'

  return (
    <Wrap variant="outlined">
      <Title>📋 סטטוס הזמנות</Title>
      <Grid>
        <Cell $ok={totalFlights > 0} onClick={() => navigate(`/trip/${trip.id}/travel`)}>
          <Top>
            <Label>טיסות</Label>
            <IconWrap $ok={totalFlights > 0}><Plane size={16} /></IconWrap>
          </Top>
          <Value>{totalFlights}</Value>
          <Sub>{flightCost > 0 ? fmt(flightCost, trip.flights[0]?.currency ?? trip.budget.currency) : 'אין הזמנות'}</Sub>
        </Cell>
        <Cell $ok={totalAcc > 0} onClick={() => navigate(`/trip/${trip.id}/travel`)}>
          <Top>
            <Label>לינות</Label>
            <IconWrap $ok={totalAcc > 0}><Hotel size={16} /></IconWrap>
          </Top>
          <Value>{totalAcc}</Value>
          <Sub>{accCost > 0 ? fmt(accCost, trip.accommodations[0]?.currency ?? trip.budget.currency) : 'אין הזמנות'}</Sub>
        </Cell>
        <Cell $ok={totalCars > 0} onClick={() => navigate(`/trip/${trip.id}/travel`)}>
          <Top>
            <Label>רכבים</Label>
            <IconWrap $ok={totalCars > 0}><Car size={16} /></IconWrap>
          </Top>
          <Value>{totalCars}</Value>
          <Sub>{carCost > 0 ? fmt(carCost, (trip.carRentals ?? [])[0]?.currency ?? trip.budget.currency) : 'אין הזמנות'}</Sub>
        </Cell>
      </Grid>
    </Wrap>
  )
}
