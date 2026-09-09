import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, Stack, Typography } from 'myk-library'
import styled from 'styled-components'
import { useTripStore } from '@/stores/tripStore'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useTripMapPois } from '@/hooks/useTripMapPois'
import IllustratedTripMap from '@/components/map/IllustratedTripMap'
import { warmDisplayFont } from '@/theme/warmTheme'
import { formatDateShort } from '@/utils/date'
import { ExternalLink, X } from 'lucide-react'

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 60px);
  max-height: calc(100dvh - 60px);
  min-width: 0;
`

const Header = styled.div<{ $mobile: boolean }>`
  padding: 10px ${({ $mobile }) => ($mobile ? '12px' : '20px')} 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray[200]};
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.gray[50]};
`

const ChipRow = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 4px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const Chip = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

const MapStage = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
`

const Panel = styled.aside<{ $mobile: boolean }>`
  position: absolute;
  z-index: 800;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.gray[200]};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: 14px 16px 16px;
  ${({ $mobile }) =>
    $mobile
      ? `
        left: 10px;
        right: 10px;
        bottom: 10px;
        border-radius: 16px;
        max-height: 42%;
        overflow-y: auto;
      `
      : `
        top: 12px;
        inset-inline-start: 12px;
        width: min(360px, calc(100% - 24px));
        border-radius: 16px;
      `}
`

const PanelTitle = styled.div`
  font-family: ${warmDisplayFont};
  font-size: 20px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.gray[900]};
`

const Blurb = styled.p`
  margin: 8px 0 12px;
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.gray[700]};
`

const LinkBtn = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 999px;
  text-decoration: none;
  &:hover { filter: brightness(0.95); }
`

const CloseBtn = styled.button`
  position: absolute;
  top: 10px;
  inset-inline-end: 10px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray[500]};
  cursor: pointer;
  padding: 4px;
`

const EmptyBox = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 16px;
  color: ${({ theme }) => theme.colors.gray[600]};
`

export default function MapPage() {
  const { id } = useParams<{ id: string }>()
  const trip = useTripStore(s => s.trips.find(t => t.id === id))
  const { isMobile } = useBreakpoint()
  const { pois } = useTripMapPois(trip)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = pois.find(p => p.id === selectedId) ?? null
  const activeId = selected?.id ?? null

  if (!trip) return null

  return (
    <PageWrapper>
      <Header $mobile={isMobile}>
        <Stack direction="row" align="center" spacing="sm" style={{ flexWrap: 'wrap' }}>
          <Typography variant="h5" style={{ margin: 0, fontFamily: warmDisplayFont }}>
            🗺️ מפה מצוירת
          </Typography>
          <Badge variant="info" size="sm">{trip.destination}</Badge>
          <Badge size="sm">📍 {pois.length} מקומות</Badge>
        </Stack>
        <Typography variant="caption" style={{ opacity: 0.75, display: 'block', marginTop: 4 }}>
          סיכות מלוח הזמנים — לוחצים לפתיחת הסבר קצר. מתעדכן כשמשנים מיקום באירוע.
        </Typography>
        {pois.length > 0 && (
          <ChipRow>
            {pois.map(poi => (
              <Chip
                key={poi.id}
                type="button"
                $active={poi.id === activeId}
                onClick={() => setSelectedId(poi.id)}
              >
                <span>{poi.emoji}</span>
                <span>{poi.name}</span>
              </Chip>
            ))}
          </ChipRow>
        )}
      </Header>

      {pois.length === 0 ? (
        <EmptyBox>
          <Typography variant="body2">
            אין עדיין מקומות עם מיקום גיאוגרפי. הוסיפו כתובת לאירוע בלו״ז והסיכה תופיע כאן.
          </Typography>
        </EmptyBox>
      ) : (
        <MapStage>
          <IllustratedTripMap
            pois={pois}
            selectedId={activeId}
            onSelect={setSelectedId}
          />
          {selected && (
            <Panel $mobile={isMobile} dir="rtl">
              <CloseBtn type="button" onClick={() => setSelectedId(null)} aria-label="סגור">
                <X size={16} />
              </CloseBtn>
              <Stack direction="row" align="center" spacing="sm">
                <span style={{ fontSize: 28 }}>{selected.emoji}</span>
                <PanelTitle>{selected.name}</PanelTitle>
              </Stack>
              <Blurb>{selected.blurb}</Blurb>
              {selected.dayDates.length > 0 && (
                <Typography variant="caption" style={{ display: 'block', marginBottom: 10, opacity: 0.75 }}>
                  בלו״ז: {selected.dayDates.map(d => formatDateShort(d)).join(' · ')}
                </Typography>
              )}
              <LinkBtn href={selected.linkUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                {selected.linkLabel}
              </LinkBtn>
            </Panel>
          )}
        </MapStage>
      )}
    </PageWrapper>
  )
}
