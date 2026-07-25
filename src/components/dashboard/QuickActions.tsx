import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { Map as MapIcon, Wallet, Plane, ListTodo, Backpack } from 'lucide-react'

interface Props {
  tripId: string
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  @media (min-width: 768px) {
    grid-template-columns: repeat(6, 1fr);
  }
`

const Btn = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  min-height: 72px;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.gray[100]};
    border-color: ${({ theme }) => theme.colors.primary[300]};
  }
  &:active { transform: scale(0.96); }
`

const IconBox = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.primary[100]};
  color: ${({ theme }) => theme.colors.primary[600]};
`

interface Action {
  label: string
  path: string
  icon: React.ReactNode
}

export default function QuickActions({ tripId }: Props) {
  const navigate = useNavigate()
  const actions: Action[] = [
    { label: 'לוח זמנים', path: 'itinerary', icon: <MapIcon size={18} /> },
    { label: 'תקציב', path: 'budget', icon: <Wallet size={18} /> },
    { label: 'משימות', path: 'tasks', icon: <ListTodo size={18} /> },
    { label: 'ציוד', path: 'packing', icon: <Backpack size={18} /> },
    { label: 'טיסות', path: 'travel', icon: <Plane size={18} /> },
  ]

  return (
    <Grid>
      {actions.map(a => (
        <Btn key={a.path} onClick={() => navigate(`/trip/${tripId}/${a.path}`)}>
          <IconBox>{a.icon}</IconBox>
          <span>{a.label}</span>
        </Btn>
      ))}
    </Grid>
  )
}
