import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Typography } from 'myk-library'

const Row = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  justify-content: center;
`

const Unit = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 4px;
  border-radius: 12px;
  background: rgba(245,158,11,0.05);
  border: 1px solid rgba(245,158,11,0.12);
  min-width: 0;
`

const Num = styled.div`
  font-size: clamp(22px, 7vw, 36px);
  font-weight: 800;
  line-height: 1;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
`

const Label = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.gray[500]};
  margin-top: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
`

interface Props {
  startDate: string
  endDate: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function CountdownTimer({ startDate, endDate }: Props) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const now = Date.now()
  const start = new Date(startDate + 'T00:00:00').getTime()
  const end = new Date(endDate + 'T23:59:59').getTime()

  if (now > end) {
    return (
      <Typography variant="h4" style={{ textAlign: 'center', margin: 0 }}>
        🎉 טיול נהדר!
      </Typography>
    )
  }

  if (now >= start) {
    return (
      <Typography variant="h4" style={{ textAlign: 'center', margin: 0 }}>
        ✈️ בטיול עכשיו!
      </Typography>
    )
  }

  const diff = start - now
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  return (
    <Row>
      <Unit><Num>{days}</Num><Label>ימים</Label></Unit>
      <Unit><Num>{pad(hours)}</Num><Label>שעות</Label></Unit>
      <Unit><Num>{pad(minutes)}</Num><Label>דקות</Label></Unit>
      <Unit><Num>{pad(seconds)}</Num><Label>שניות</Label></Unit>
    </Row>
  )
}
