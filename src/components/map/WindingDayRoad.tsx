import { useMemo, useRef, type ReactNode } from 'react'
import styled from 'styled-components'
import { format, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import type { TripDay } from '@/types/trip'
import type { TripMapPoi } from '@/lib/tripMapPois'
import {
  collectDayStops,
  dayRoadTheme,
  layoutWindingRoad,
  type DayRoadTheme,
} from '@/lib/tripMapDayStops'
import LandmarkGlyph from '@/components/map/LandmarkGlyph'
import { warmDisplayFont } from '@/theme/warmTheme'

interface Props {
  day: TripDay
  pois: TripMapPoi[]
  selectedStopId: string | null
  onSelectStop: (stopId: string, poiId?: string) => void
  onSwipeDay?: (dir: -1 | 1) => void
}

const VIEW = { width: 1000, height: 640 }

const Paper = styled.div`
  position: relative;
  background: #f7f3e8;
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

const Callout = styled.button<{ $x: number; $y: number; $side: 'start' | 'end'; $active: boolean }>`
  pointer-events: auto;
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: ${({ $side }) => ($side === 'start'
    ? 'translate(-8%, -108%)'
    : 'translate(-92%, -108%)')};
  max-width: min(220px, 42%);
  text-align: right;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary[400] : theme.colors.gray[200])};
  background: ${({ $active }) => ($active ? '#fffdf7' : 'rgba(255,253,247,0.94)')};
  border-radius: 12px;
  padding: 8px 10px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(42, 32, 19, 0.12);
  font-family: inherit;
  color: inherit;
`

const CalloutTime = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const CalloutTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[900]};
  line-height: 1.3;
`

const CalloutDetail = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gray[600]};
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const Milestone = styled.button<{ $x: number; $y: number; $active: boolean }>`
  pointer-events: auto;
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid ${({ $active }) => ($active ? '#d67a1f' : '#f7f3e8')};
  background: #1e3a5f;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  z-index: 2;
`

const GlyphFloat = styled.div<{ $x: number; $y: number; $side: 'start' | 'end' }>`
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: ${({ $side }) => ($side === 'start'
    ? 'translate(20%, -30%)'
    : 'translate(-120%, -30%)')};
  pointer-events: none;
`

const TitleBar = styled.div`
  position: absolute;
  top: 10px;
  right: 14px;
  left: 14px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
`

const DayTitle = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 20px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const DayDate = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary[600]};
`

const THEME_FILL: Record<DayRoadTheme, string> = {
  disney: '#eef3e4',
  sea: '#e4eef3',
  island: '#eaf4e6',
  beach: '#f3efe2',
  airport: '#ece8f3',
  villa: '#f4eadc',
  default: '#f7f3e8',
}

function themeDecor(theme: DayRoadTheme): ReactNode {
  if (theme === 'sea') {
    return (
      <>
        <path d="M40 560 Q120 540 200 560 T360 560 T520 560 T680 560 T960 560" fill="none" stroke="#5B8FA8" strokeWidth="3" opacity="0.35" />
        <path d="M80 590 Q160 574 240 590 T400 590 T560 590 T900 590" fill="none" stroke="#5B8FA8" strokeWidth="2" opacity="0.25" />
      </>
    )
  }
  if (theme === 'island' || theme === 'beach') {
    return (
      <>
        <circle cx="120" cy="90" r="28" fill="#E0B44B" opacity="0.55" />
        <path d="M820 120 Q790 90 760 120 Q790 110 820 128" fill="#7FA860" />
        <path d="M840 128 V200" stroke="#6B4F32" strokeWidth="4" />
      </>
    )
  }
  if (theme === 'disney') {
    return (
      <>
        <path d="M70 160 L110 90 L150 160 Z" fill="#fffdf7" stroke="#1E3A5F" strokeWidth="2" />
        <rect x="92" y="130" width="16" height="30" fill="#1E3A5F" />
        <circle cx="880" cy="80" r="10" fill="#E0B44B" opacity="0.7" />
      </>
    )
  }
  if (theme === 'airport') {
    return <path d="M80 80 L200 120 L160 70 Z" fill="#1E3A5F" opacity="0.18" />
  }
  return <circle cx="900" cy="70" r="22" fill="#E0B44B" opacity="0.4" />
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
  const layout = useMemo(
    () => layoutWindingRoad(Math.max(1, stops.length), day.id, VIEW.width, VIEW.height),
    [day.id, stops.length],
  )
  const touchX = useRef<number | null>(null)

  const dateLabel = format(parseISO(day.date), 'EEEE d בMMMM', { locale: he })

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
      <Frame viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label={`מפת היום ${day.label ?? day.date}`}>
        <rect width="100%" height="100%" fill={THEME_FILL[theme]} />
        {themeDecor(theme)}
        <path d={layout.d} fill="none" stroke="#6B4F32" strokeWidth="22" strokeLinecap="round" />
        <path
          d={layout.centerline}
          fill="none"
          stroke="#FBF3DF"
          strokeWidth="4"
          strokeDasharray="10 12"
          strokeLinecap="round"
        />
        <circle cx={layout.start.x} cy={layout.start.y} r="10" fill="#C45C3E" />
        <circle cx={layout.end.x} cy={layout.end.y} r="10" fill="#1E3A5F" />
      </Frame>
      <Overlay>
        <TitleBar>
          <DayTitle>{day.label || 'יום בטיול'}</DayTitle>
          <DayDate>{dateLabel}</DayDate>
        </TitleBar>
        {stops.map((stop, i) => {
          const pt = layout.stops[i] ?? layout.stops[layout.stops.length - 1]
          const xPct = (pt.x / VIEW.width) * 100
          const yPct = (pt.y / VIEW.height) * 100
          const side: 'start' | 'end' = i % 2 === 0 ? 'start' : 'end'
          const active = stop.id === selectedStopId
          return (
            <div key={stop.id}>
              <GlyphFloat $x={xPct} $y={yPct} $side={side === 'start' ? 'end' : 'start'}>
                <LandmarkGlyph kind={stop.kind} placeKey={stop.location} size={48} />
              </GlyphFloat>
              <Milestone
                type="button"
                $x={xPct}
                $y={yPct}
                $active={active}
                onClick={() => onSelectStop(stop.id, stop.poiId)}
                aria-label={stop.title}
              >
                {i + 1}
              </Milestone>
              <Callout
                type="button"
                $x={xPct}
                $y={yPct}
                $side={side}
                $active={active}
                onClick={() => onSelectStop(stop.id, stop.poiId)}
              >
                {stop.time && <CalloutTime>{stop.time}{stop.endTime ? `–${stop.endTime}` : ''}</CalloutTime>}
                <CalloutTitle>{stop.emoji} {stop.title}</CalloutTitle>
                <CalloutDetail>{stop.blurb}</CalloutDetail>
              </Callout>
            </div>
          )
        })}
      </Overlay>
    </Paper>
  )
}
