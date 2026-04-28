import styled from 'styled-components'

export type TripPhase = 'planning' | 'soon' | 'live' | 'done'

interface Props {
  phase: TripPhase
  daysToStart: number
  dayOfTrip?: number
  totalDays: number
}

const Pill = styled.div<{ $tone: TripPhase }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  ${({ $tone }) => {
    switch ($tone) {
      case 'live':
        return `
          background: linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08));
          color: #10b981;
          border: 1px solid rgba(16,185,129,0.35);
        `
      case 'soon':
        return `
          background: linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08));
          color: #f59e0b;
          border: 1px solid rgba(245,158,11,0.35);
        `
      case 'done':
        return `
          background: rgba(139,148,158,0.15);
          color: #8b949e;
          border: 1px solid rgba(139,148,158,0.3);
        `
      default:
        return `
          background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.08));
          color: #60a5fa;
          border: 1px solid rgba(59,130,246,0.35);
        `
    }
  }}
`

const Dot = styled.span<{ $tone: TripPhase }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  ${({ $tone }) => $tone === 'live' && `
    box-shadow: 0 0 0 0 currentColor;
    animation: pulse 1.6s infinite;
    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
      70%  { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
      100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
    }
  `}
`

export default function PhaseBadge({ phase, daysToStart, dayOfTrip, totalDays }: Props) {
  let label: string
  switch (phase) {
    case 'live':
      label = `יום ${dayOfTrip} מתוך ${totalDays} · בטיול עכשיו`
      break
    case 'soon':
      label = daysToStart === 0 ? 'יוצאים היום!' : daysToStart === 1 ? 'יוצאים מחר' : `נשארו ${daysToStart} ימים`
      break
    case 'done':
      label = 'הטיול הסתיים'
      break
    default:
      label = `שלב תכנון · עוד ${daysToStart} ימים`
  }
  return (
    <Pill $tone={phase}>
      <Dot $tone={phase} />
      <span>{label}</span>
    </Pill>
  )
}
