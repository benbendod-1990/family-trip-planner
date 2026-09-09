import { useMemo, useRef } from 'react'
import styled from 'styled-components'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import type { TripDay } from '@/types/trip'
import type { TripMapPoi } from '@/lib/tripMapPois'
import {
  collectDayStops,
  dayRoadTheme,
  layoutDayPoster,
} from '@/lib/tripMapDayStops'
import DayRoadScenery from '@/components/map/DayRoadScenery'
import LandmarkGlyph from '@/components/map/LandmarkGlyph'
import { warmDisplayFont } from '@/theme/warmTheme'

interface Props {
  day: TripDay
  pois: TripMapPoi[]
  selectedStopId: string | null
  onSelectStop: (stopId: string, poiId?: string) => void
  onSwipeDay?: (dir: -1 | 1) => void
}

const Paper = styled.div`
  position: relative;
  background: #e6dcc4;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
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

const Chip = styled.button<{ $x: number; $y: number; $active: boolean }>`
  pointer-events: auto;
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  max-width: 40%;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary[400] : theme.colors.gray[200])};
  background: ${({ $active }) => ($active ? '#fffdf7' : 'rgba(255,253,247,0.95)')};
  border-radius: 12px;
  padding: 4px 8px 5px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(42, 32, 19, 0.14);
  font-family: inherit;
  color: ${({ theme }) => theme.colors.gray[900]};
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  z-index: ${({ $active }) => ($active ? 4 : 3)};
`

const ChipTime = styled.div`
  font-size: 10px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const Milestone = styled.button<{ $x: number; $y: number; $active: boolean }>`
  pointer-events: auto;
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid ${({ $active }) => ($active ? '#d67a1f' : '#1e3a5f')};
  background: #fffdf7;
  color: #1e3a5f;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  z-index: 2;
  box-shadow: 0 1px 3px rgba(42, 32, 19, 0.2);
`

const GlyphFloat = styled.div<{ $x: number; $y: number }>`
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0.92;
`

const TitleBar = styled.div`
  position: absolute;
  top: 10px;
  right: 14px;
  left: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  pointer-events: none;
  text-align: right;
`

const DayTitle = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 18px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
  text-shadow: 0 1px 0 rgba(255, 253, 247, 0.8);
`

const DayDate = styled.div`
  font-size: 12px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gray[600]};
`

function RoadCar({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} aria-hidden>
      <rect x="-18" y="-9" width="36" height="16" rx="4" fill="#1E3A5F" />
      <rect x="-4" y="-7" width="14" height="10" rx="2" fill="#5B8FA8" />
      <circle cx="-10" cy="8" r="4" fill="#3D3120" />
      <circle cx="10" cy="8" r="4" fill="#3D3120" />
    </g>
  )
}

export default function WindingDayRoad({
  day,
  pois,
  selectedStopId,
  onSelectStop,
  onSwipeDay,
}: Props) {
  const stops = useMemo(() => collectDayStops(day, pois), [day, pois])
  const theme = dayRoadTheme(stops, day.label)
  const poster = useMemo(
    () => layoutDayPoster(stops, day.id),
    [day.id, stops],
  )
  const touchX = useRef<number | null>(null)
  const dateLabel = format(parseISO(day.date), 'EEEE d בMMMM', { locale: he })
  const { width, height, road, chips } = poster
  const chipById = new Map(chips.map(c => [c.id, c]))

  return (
    <Paper
      onTouchStart={e => { touchX.current = e.changedTouches[0]?.clientX ?? null }}
      onTouchEnd={e => {
        if (touchX.current == null || !onSwipeDay) return
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current
        if (Math.abs(dx) > 48) onSwipeDay(dx > 0 ? -1 : 1)
        touchX.current = null
      }}
    >
      <Frame viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`מפת היום ${day.label ?? day.date}`}>
        <DayRoadScenery width={width} height={height} theme={theme} seed={day.id} />
        <path d={road.d} fill="none" stroke="#4A3420" strokeWidth="36" strokeLinecap="round" />
        <path d={road.d} fill="none" stroke="#6B4F32" strokeWidth="28" strokeLinecap="round" />
        <path
          d={road.centerline}
          fill="none"
          stroke="#FBF3DF"
          strokeWidth="3.4"
          strokeDasharray="12 14"
          strokeLinecap="round"
        />
        {chips.map(chip => (
          <line
            key={`lead-${chip.id}`}
            x1={chip.leader.x1}
            y1={chip.leader.y1}
            x2={chip.leader.x2}
            y2={chip.leader.y2}
            stroke="#6B4F32"
            strokeWidth="1.4"
            strokeDasharray="3 4"
            opacity="0.55"
          />
        ))}
        <circle cx={road.start.x} cy={road.start.y} r="7" fill="#C45C3E" />
        <circle cx={road.end.x} cy={road.end.y} r="7" fill="#1E3A5F" />
        <RoadCar x={road.car.x} y={road.car.y} angle={road.car.angle} />
      </Frame>
      <Overlay>
        <TitleBar>
          <DayTitle>{day.label || 'יום בטיול'}</DayTitle>
          <DayDate>{dateLabel}</DayDate>
          <Hint>לחצו על תחנה לפירוט</Hint>
        </TitleBar>
        {stops.map((stop, i) => {
          const pt = road.stops[i] ?? road.stops[road.stops.length - 1]
          const chip = chipById.get(stop.id)
          const xPct = (pt.x / width) * 100
          const yPct = (pt.y / height) * 100
          const active = stop.id === selectedStopId
          const gxy = {
            x: ((pt.x + pt.nx * -42) / width) * 100,
            y: ((pt.y + pt.ny * -42) / height) * 100,
          }
          return (
            <div key={stop.id}>
              <GlyphFloat $x={gxy.x} $y={gxy.y}>
                <LandmarkGlyph kind={stop.kind} placeKey={stop.location} size={40} />
              </GlyphFloat>
              <Milestone
                type="button"
                $x={xPct}
                $y={yPct}
                $active={active}
                onClick={() => onSelectStop(stop.id, stop.poiId)}
                aria-label={stop.title}
                aria-pressed={active}
              >
                {i + 1}
              </Milestone>
              {chip && (
                <Chip
                  type="button"
                  $x={(chip.cx / width) * 100}
                  $y={(chip.cy / height) * 100}
                  $active={active}
                  onClick={() => onSelectStop(stop.id, stop.poiId)}
                >
                  {chip.text.split('\n').length > 1 ? (
                    <>
                      <ChipTime>{chip.text.split('\n')[0]}</ChipTime>
                      <div>{chip.text.split('\n').slice(1).join(' ')}</div>
                    </>
                  ) : chip.text}
                </Chip>
              )}
            </div>
          )
        })}
      </Overlay>
    </Paper>
  )
}
