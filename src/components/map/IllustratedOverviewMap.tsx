import { useMemo } from 'react'
import styled from 'styled-components'
import type { TripMapPoi } from '@/lib/tripMapPois'
import { layoutOverviewMap, MAP_VIEW } from '@/lib/tripMapGeo'
import LandmarkGlyph from '@/components/map/LandmarkGlyph'

interface Props {
  pois: TripMapPoi[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const Stage = styled.div`
  position: relative;
  width: 100%;
  background:
    radial-gradient(ellipse 80% 50% at 80% 70%, rgba(91, 143, 168, 0.16), transparent 55%),
    radial-gradient(ellipse 40% 40% at 15% 45%, rgba(91, 143, 168, 0.10), transparent 50%),
    #dfeae6;
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

const StopBtn = styled.button<{ $x: number; $y: number; $active: boolean }>`
  position: absolute;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  transform: translate(-50%, -88%);
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  z-index: ${({ $active }) => ($active ? 4 : 3)};
  filter: ${({ $active }) => ($active ? 'drop-shadow(0 4px 10px rgba(42,32,19,0.35))' : 'none')};
`

const StopLabel = styled.span<{ $active: boolean }>`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray[900]};
  background: ${({ $active }) => ($active ? '#FFFDF7' : 'rgba(255,253,247,0.92)')};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary[400] : theme.colors.gray[200])};
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
  max-width: 128px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 1px 3px rgba(42, 32, 19, 0.12);
`

const Caption = styled.div`
  position: absolute;
  inset-inline-end: 12px;
  bottom: 10px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gray[600]};
  background: rgba(255, 253, 247, 0.82);
  border-radius: 999px;
  padding: 3px 10px;
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

export default function IllustratedOverviewMap({ pois, selectedId, onSelect }: Props) {
  const layout = useMemo(() => layoutOverviewMap(pois), [pois])

  if (pois.length === 0) {
    return (
      <Stage>
        <Empty>אין עדיין מקומות עם מיקום גיאוגרפי. הוסיפו כתובת לאירוע בלו״ז — המפה תיבנה מהמסלול.</Empty>
      </Stage>
    )
  }

  return (
    <Stage>
      <Frame
        viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}
        role="img"
        aria-label="מפה מצוירת של מסלול הטיול"
      >
        <defs>
          <pattern id="diary-dots" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(42,32,19,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#d5e6e2" />
        <rect width="100%" height="100%" fill="url(#diary-dots)" />
        {layout.landD && (
          <path d={layout.landD} fill="#E8D9B0" stroke="#6B4F32" strokeWidth="2.2" />
        )}
        {layout.routeD && (
          <>
            <path d={layout.routeD} fill="none" stroke="#6B4F32" strokeWidth="7" strokeLinecap="round" opacity="0.9" />
            <path
              d={layout.routeD}
              fill="none"
              stroke="#FBF3DF"
              strokeWidth="2.4"
              strokeDasharray="7 8"
              strokeLinecap="round"
            />
          </>
        )}
        {layout.labels.map(l => (
          <text
            key={`${l.text}-${l.x}`}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fill="#5B8FA8"
            fontSize="13"
            fontFamily="Heebo, sans-serif"
          >
            {l.text}
          </text>
        ))}
      </Frame>
      {layout.placed.map(p => (
        <StopBtn
          key={p.id}
          type="button"
          $x={(p.x / MAP_VIEW.width) * 100}
          $y={(p.y / MAP_VIEW.height) * 100}
          $active={p.id === selectedId}
          onClick={() => onSelect(p.id)}
          aria-label={p.name}
          aria-pressed={p.id === selectedId}
        >
          <LandmarkGlyph kind={p.kind} placeKey={p.key} selected={p.id === selectedId} size={p.id === selectedId ? 64 : 54} />
          <StopLabel $active={p.id === selectedId}>{p.name}</StopLabel>
        </StopBtn>
      ))}
      <Caption>מסלול לפי לוח הזמנים · לחיצה על מקום פותחת הסבר</Caption>
    </Stage>
  )
}
