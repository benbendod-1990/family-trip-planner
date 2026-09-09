import { useMemo } from 'react'
import styled from 'styled-components'
import type { TripPlan } from '@/types/trip-plan'
import { useTripMapPois } from '@/hooks/useTripMapPois'
import {
  collectFrontStops,
  layoutFrontPoster,
} from '@/lib/tripFrontPoster'
import LandmarkGlyph from '@/components/map/LandmarkGlyph'

export interface FrontPosterSelect {
  id: string
  name: string
  emoji: string
  blurb: string
  linkUrl?: string
  linkLabel?: string
  dayDates?: string[]
}

interface Props {
  trip: TripPlan
  selectedId: string | null
  onSelect: (target: FrontPosterSelect) => void
}

const Stage = styled.div`
  position: relative;
  width: 100%;
  background:
    linear-gradient(180deg, rgba(255,253,247,0.35), transparent 90px),
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 17px,
      rgba(91, 143, 168, 0.09) 17px,
      rgba(91, 143, 168, 0.09) 18px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 17px,
      rgba(91, 143, 168, 0.09) 17px,
      rgba(91, 143, 168, 0.09) 18px
    ),
    #F7F1DE;
  border-radius: 18px;
  overflow: hidden;
`

const Frame = styled.svg`
  display: block;
  width: 100%;
  height: auto;
`

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`

const GlyphFloat = styled.div<{ $x: number; $y: number; $active: boolean }>`
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  filter: ${({ $active }) =>
    $active
      ? 'drop-shadow(0 6px 10px rgba(42,32,19,0.28))'
      : 'drop-shadow(0 3px 5px rgba(42,32,19,0.16))'};
  z-index: ${({ $active }) => ($active ? 3 : 2)};
`

const Milestone = styled.button<{ $x: number; $y: number; $active: boolean }>`
  pointer-events: auto;
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid ${({ $active }) => ($active ? '#d67a1f' : '#4A4F57')};
  background: #fffdf7;
  color: #6B4F32;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  z-index: 4;
  box-shadow: 0 1px 3px rgba(42, 32, 19, 0.2);
`

const Chip = styled.button<{ $x: number; $y: number; $active: boolean }>`
  pointer-events: auto;
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  max-width: 42%;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary[400] : theme.colors.gray[200])};
  background: ${({ $active }) => ($active ? '#fffdf7' : 'rgba(255,253,247,0.94)')};
  border-radius: 12px;
  padding: 4px 8px 5px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(42, 32, 19, 0.12);
  font-family: inherit;
  color: ${({ theme }) => theme.colors.gray[900]};
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  z-index: ${({ $active }) => ($active ? 5 : 3)};
`

const ChipDate = styled.div`
  font-size: 10px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const Empty = styled.div`
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 28px 16px;
  color: ${({ theme }) => theme.colors.gray[600]};
  font-size: 14px;
`

function RoadCar({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} aria-hidden>
      <rect x="-15" y="-8" width="30" height="14" rx="4" fill="#3D7EA6" />
      <rect x="-2" y="-6" width="12" height="9" rx="2" fill="#B8D4E3" />
      <circle cx="-8" cy="7" r="3.4" fill="#3D3120" />
      <circle cx="8" cy="7" r="3.4" fill="#3D3120" />
    </g>
  )
}

function TinyPlane({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} aria-hidden>
      <path d="M-18 2 L8 -2 L22 -12 L24 -8 L12 2 L20 12 L14 13 L6 4 L-8 14 L-12 10 L-2 2 Z" fill="#1E3A5F" />
    </g>
  )
}

export default function TripFrontPoster({ trip, selectedId, onSelect }: Props) {
  const { pois } = useTripMapPois(trip)
  const stops = useMemo(() => collectFrontStops(trip, pois), [trip, pois])
  const layout = useMemo(
    () => layoutFrontPoster(stops, `${trip.id}:${stops.map(s => s.id).join('|')}`),
    [stops, trip.id],
  )

  if (stops.length === 0) {
    return (
      <Stage>
        <Empty>עדיין אין ימים בלו״ז. הוסיפו ימים — הפוסטר ייבנה מהמסלול.</Empty>
      </Stage>
    )
  }

  const { width, height } = layout
  const chipById = new Map(layout.chips.map(c => [c.id, c]))

  return (
    <Stage data-testid="trip-front-poster">
      <Frame viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`פוסטר מסלול: ${trip.name}`}>
        <defs>
          <pattern id="front-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M22 0 H0 V22" fill="none" stroke="rgba(91,143,168,0.16)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="#F7F1DE" />
        <rect width={width} height={height} fill="url(#front-grid)" />
        <path d={layout.roadD} fill="none" stroke="#3E4450" strokeWidth="40" strokeLinecap="round" />
        <path d={layout.roadD} fill="none" stroke="#5C6370" strokeWidth="30" strokeLinecap="round" />
        <path
          d={layout.centerline}
          fill="none"
          stroke="#FBF3DF"
          strokeWidth="3.2"
          strokeDasharray="11 13"
          strokeLinecap="round"
        />
        {layout.chips.map(chip => (
          <line
            key={`lead-${chip.id}`}
            x1={chip.leader.x1}
            y1={chip.leader.y1}
            x2={chip.leader.x2}
            y2={chip.leader.y2}
            stroke="#6B4F32"
            strokeWidth="1.2"
            strokeDasharray="3 4"
            opacity="0.4"
          />
        ))}
        <circle cx={layout.start.x} cy={layout.start.y} r="7" fill="#C45C3E" />
        <circle cx={layout.end.x} cy={layout.end.y} r="7" fill="#1E3A5F" />
        {layout.cars.map((car, i) => (
          <RoadCar key={`car-${i}`} x={car.x} y={car.y} angle={car.angle} />
        ))}
        {layout.planes.map((plane, i) => (
          <TinyPlane key={`plane-${i}`} x={plane.x} y={plane.y} angle={plane.angle} />
        ))}
      </Frame>
      <Overlay>
        {layout.stops.map(stop => {
          const chip = chipById.get(stop.id)
          const xPct = (stop.x / width) * 100
          const yPct = (stop.y / height) * 100
          const active = stop.id === selectedId
          const gxy = {
            x: ((stop.x + stop.nx * -48) / width) * 100,
            y: ((stop.y + stop.ny * -48) / height) * 100,
          }
          const select = () =>
            onSelect({
              id: stop.id,
              name: stop.title,
              emoji: stop.emoji,
              blurb: stop.blurb,
              linkUrl: stop.linkUrl,
              linkLabel: stop.linkLabel,
              dayDates: stop.dates,
            })
          return (
            <div key={stop.id}>
              <GlyphFloat $x={gxy.x} $y={gxy.y} $active={active}>
                <LandmarkGlyph kind={stop.kind} placeKey={stop.placeKey} selected={active} size={58} />
              </GlyphFloat>
              <Milestone
                type="button"
                $x={xPct}
                $y={yPct}
                $active={active}
                onClick={select}
                aria-label={stop.title}
                aria-pressed={active}
              >
                {stop.index}
              </Milestone>
              {chip && (
                <Chip
                  type="button"
                  $x={(chip.cx / width) * 100}
                  $y={(chip.cy / height) * 100}
                  $active={active}
                  onClick={select}
                >
                  {chip.text.split('\n').length > 1 ? (
                    <>
                      <ChipDate>{chip.text.split('\n')[0]}</ChipDate>
                      <div>{chip.text.split('\n').slice(1).join(' ')}</div>
                    </>
                  ) : chip.text}
                </Chip>
              )}
            </div>
          )
        })}
      </Overlay>
    </Stage>
  )
}
