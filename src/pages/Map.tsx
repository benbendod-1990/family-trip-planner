import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import styled from 'styled-components'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useTripMapPois } from '@/hooks/useTripMapPois'
import { warmDisplayFont, warmPageBackground } from '@/theme/warmTheme'
import { formatDateHe, formatDateShort, getTripDuration } from '@/utils/date'
import IllustratedOverviewMap from '@/components/map/IllustratedOverviewMap'
import WindingDayRoad from '@/components/map/WindingDayRoad'
import MiniTripCalendars from '@/components/map/MiniTripCalendars'
import SegmentCards from '@/components/map/SegmentCards'
import PoiBlurbSheet, { type BlurbTarget } from '@/components/map/PoiBlurbSheet'
import { PostageStamp, WashiTape } from '@/components/map/DiaryDecor'
import { collectDayStops } from '@/lib/tripMapDayStops'
import { deriveTripSegments, flowPillsFromDays } from '@/lib/tripMapSegments'

const Page = styled.div<{ $mobile: boolean }>`
  background: ${warmPageBackground};
  min-height: 100%;
  padding: ${({ $mobile }) => ($mobile ? '12px 12px 96px' : '24px')};
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${({ $mobile }) => ($mobile ? '16px' : '22px')};
`

const Paper = styled.section`
  position: relative;
  background: #f7f3e8;
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  border-radius: 22px;
  padding: 18px 16px 20px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const Tape = styled.div<{ $side: 'start' | 'end'; $top?: number }>`
  position: absolute;
  top: ${({ $top }) => $top ?? -8}px;
  ${({ $side }) => ($side === 'start' ? 'inset-inline-start: 18px;' : 'inset-inline-end: 22px;')}
  pointer-events: none;
`

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`

const TitleBlock = styled.div`
  flex: 1;
  min-width: 0;
`

const Title = styled.h1`
  font-family: ${warmDisplayFont};
  font-size: clamp(22px, 4vw, 32px);
  font-weight: 500;
  margin: 0 0 4px;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Sub = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.gray[600]};
`

const SectionLabel = styled.h2`
  font-family: ${warmDisplayFont};
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 8px;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const PillRow = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 2px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const Pill = styled.button<{ $active?: boolean }>`
  flex-shrink: 0;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary[400] : theme.colors.gray[200])};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary[100] : theme.colors.white)};
  color: ${({ theme }) => theme.colors.gray[900]};
  border-radius: 999px;
  padding: 6px 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`

const DayStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const DayScroller = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
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

const IconBtn = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  background: ${({ theme }) => theme.colors.white};
  border-radius: 10px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: inherit;
  flex-shrink: 0;
  &:disabled { opacity: 0.35; cursor: default; }
`

const Checklist = styled.div`
  position: relative;
  background: ${({ theme }) => theme.colors.white};
  border: 1px dashed ${({ theme }) => theme.colors.gray[300]};
  border-radius: 16px;
  padding: 16px 16px 12px;
`

const CheckItem = styled.label`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 14px;
  padding: 4px 0;
  color: ${({ theme }) => theme.colors.gray[800]};
`

const FooterBar = styled.div`
  background: #1e3a5f;
  color: #f7f3e8;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
`

export default function MapPage() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()
  const { pois } = useTripMapPois(trip)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [dayIndex, setDayIndex] = useState(0)

  const days = useMemo(
    () => [...(trip?.days ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [trip],
  )
  const safeIndex = days.length === 0 ? 0 : Math.min(dayIndex, days.length - 1)
  const activeDay = days[safeIndex]
  const segments = useMemo(
    () => (trip ? deriveTripSegments(trip) : []),
    [trip],
  )
  const pills = useMemo(() => flowPillsFromDays(days), [days])

  const dayStops = useMemo(
    () => (activeDay ? collectDayStops(activeDay, pois) : []),
    [activeDay, pois],
  )

  const selectedPoi = pois.find(p => p.id === selectedPoiId) ?? null
  const selectedStop = dayStops.find(s => s.id === selectedStopId) ?? null

  const blurb: BlurbTarget | null = selectedPoi
    ? {
        name: selectedPoi.name,
        emoji: selectedPoi.emoji,
        blurb: selectedPoi.blurb,
        linkUrl: selectedPoi.linkUrl,
        linkLabel: selectedPoi.linkLabel,
        dayDates: selectedPoi.dayDates,
      }
    : selectedStop
      ? {
          name: selectedStop.title,
          emoji: selectedStop.emoji,
          blurb: selectedStop.blurb,
          linkUrl: selectedStop.linkUrl,
          linkLabel: selectedStop.linkLabel,
        }
      : null

  const openTasks = (trip?.tasks ?? []).filter(t => !t.done).slice(0, 6)
  const packingOpen = (trip?.packingItems ?? []).filter(p => !p.packed).slice(0, 4)
  const duration = trip ? getTripDuration(trip.startDate, trip.endDate) : 0

  if (!trip) return null

  const goDay = (next: number) => {
    if (days.length === 0) return
    const wrapped = (next + days.length) % days.length
    setDayIndex(wrapped)
    setSelectedStopId(null)
  }

  const selectDate = (iso: string) => {
    const i = days.findIndex(d => d.date === iso)
    if (i >= 0) {
      setDayIndex(i)
      setSelectedStopId(null)
    }
  }

  return (
    <Page $mobile={isMobile}>
      <Paper>
        <Tape $side="end"><WashiTape rotate={14} color="#C45C3E" /></Tape>
        <Tape $side="start" $top={6}><WashiTape rotate={-8} color="#5B8FA8" /></Tape>
        <HeaderRow>
          <PostageStamp emoji={trip.coverEmoji || '🗺️'} caption="יומן מסע" />
          <TitleBlock>
            <Title>{trip.name} — יומן מסע</Title>
            <Sub>
              {formatDateHe(trip.startDate)} – {formatDateShort(trip.endDate)}
              {' · '}
              {duration} ימים
              {trip.destination ? ` · ${trip.destination}` : ''}
            </Sub>
            <Sub style={{ marginTop: 4 }}>מפה מצוירת מלוח הזמנים החי — מתעדכנת כשמשנים ימים ומקומות.</Sub>
          </TitleBlock>
        </HeaderRow>
        {pills.length > 0 && (
          <PillRow style={{ marginTop: 14 }}>
            {pills.map(p => (
              <Pill
                key={p}
                type="button"
                $active={activeDay?.label === p || (activeDay?.label ?? '').includes(p)}
                onClick={() => {
                  const i = days.findIndex(d => (d.label ?? '').includes(p))
                  if (i >= 0) goDay(i)
                }}
              >
                {p}
              </Pill>
            ))}
          </PillRow>
        )}
      </Paper>

      {days.length > 0 && (
        <div>
          <SectionLabel>לוח שנה</SectionLabel>
          <MiniTripCalendars
            startDate={trip.startDate}
            endDate={trip.endDate}
            days={days}
            pois={pois}
            selectedDate={activeDay?.date ?? null}
            onSelectDate={selectDate}
          />
        </div>
      )}

      <div>
        <SectionLabel>מסלול הטיול</SectionLabel>
        <IllustratedOverviewMap
          pois={pois}
          selectedId={selectedPoiId}
          onSelect={poiId => {
            setSelectedPoiId(poiId)
            setSelectedStopId(null)
          }}
        />
      </div>

      {activeDay && (
        <div>
          <SectionLabel>יום ביום — דרך מצוירת</SectionLabel>
          <DayStrip>
            <IconBtn type="button" onClick={() => goDay(safeIndex - 1)} disabled={days.length < 2} aria-label="היום הקודם">
              <ChevronRight size={18} />
            </IconBtn>
            <DayScroller>
              {days.map((d, i) => (
                <DayChip
                  key={d.id}
                  type="button"
                  $active={i === safeIndex}
                  onClick={() => goDay(i)}
                >
                  <DayChipDate>{formatDateShort(d.date)}</DayChipDate>
                  <DayChipLabel>{d.label || `יום ${i + 1}`}</DayChipLabel>
                </DayChip>
              ))}
            </DayScroller>
            <IconBtn type="button" onClick={() => goDay(safeIndex + 1)} disabled={days.length < 2} aria-label="היום הבא">
              <ChevronLeft size={18} />
            </IconBtn>
          </DayStrip>
          <div style={{ marginTop: 10 }}>
            <WindingDayRoad
              day={activeDay}
              pois={pois}
              selectedStopId={selectedStopId}
              onSelectStop={(stopId, poiId) => {
                setSelectedStopId(stopId)
                setSelectedPoiId(poiId ?? null)
              }}
              onSwipeDay={dir => goDay(safeIndex + dir)}
            />
          </div>
        </div>
      )}

      {segments.length > 0 && (
        <div>
          <SectionLabel>קטעי המסע</SectionLabel>
          <SegmentCards
            segments={segments}
            onSelectDay={dayId => {
              const i = days.findIndex(d => d.id === dayId)
              if (i >= 0) goDay(i)
            }}
            onSelectPoiKey={key => {
              const poi = pois.find(p => p.key === key)
              if (poi) {
                setSelectedPoiId(poi.id)
                setSelectedStopId(null)
              }
            }}
          />
        </div>
      )}

      {(openTasks.length > 0 || packingOpen.length > 0) && (
        <Checklist>
          <Tape $side="start"><WashiTape rotate={-10} /></Tape>
          <SectionLabel>זכור לפני היציאה</SectionLabel>
          {openTasks.map(t => (
            <CheckItem key={t.id}>
              <input type="checkbox" disabled checked={false} readOnly />
              <span>{t.title}</span>
            </CheckItem>
          ))}
          {packingOpen.map(p => (
            <CheckItem key={p.id}>
              <input type="checkbox" disabled checked={false} readOnly />
              <span>{p.title}</span>
            </CheckItem>
          ))}
        </Checklist>
      )}

      {pois.length > 0 && (
        <FooterBar>
          {pois.slice(0, 8).map(p => (
            <span key={p.id}>{p.emoji} {p.name}</span>
          ))}
        </FooterBar>
      )}

      {blurb && (
        <PoiBlurbSheet
          target={blurb}
          mobile={isMobile}
          onClose={() => {
            setSelectedPoiId(null)
            setSelectedStopId(null)
          }}
        />
      )}
    </Page>
  )
}
