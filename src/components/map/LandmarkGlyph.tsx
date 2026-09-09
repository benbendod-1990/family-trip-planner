import type { DayStopKind } from '@/lib/tripMapDayStops'
import type { MapPoiKind } from '@/lib/placeCatalog'

type GlyphKind = DayStopKind | MapPoiKind | string

interface Props {
  kind: GlyphKind
  placeKey?: string
  selected?: boolean
  size?: number
}

const COLORS = {
  navy: '#1E3A5F',
  terracotta: '#C45C3E',
  cream: '#FBF3DF',
  sage: '#7FA860',
  sand: '#E8D5A8',
  brown: '#6B4F32',
  blue: '#5B8FA8',
  white: '#FFFDF7',
  gold: '#E0B44B',
}

function Castle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <ellipse cx="36" cy="66" rx="26" ry="5" fill={COLORS.sage} opacity="0.45" />
      <rect x="8" y="40" width="56" height="24" rx="2" fill="#F4F0E4" stroke={COLORS.navy} strokeWidth="1.5" />
      <path d="M14 40 V28 h10 V40 M48 40 V28 h10 V40" fill="#C9D4E0" stroke={COLORS.navy} strokeWidth="1.3" />
      <path d="M24 40 V22 L36 6 L48 22 V40" fill="#F7F4EA" stroke={COLORS.navy} strokeWidth="1.5" />
      <path d="M32 22 L36 10 L40 22" fill="#9BB0C8" />
      <rect x="33" y="26" width="6" height="14" rx="1" fill={COLORS.navy} />
      <circle cx="36" cy="20" r="2.4" fill={COLORS.gold} />
      <rect x="18" y="50" width="8" height="10" fill={COLORS.navy} opacity="0.3" />
      <rect x="46" y="50" width="8" height="10" fill={COLORS.navy} opacity="0.3" />
      <path d="M10 40 h8 l-4 -8 z M54 40 h8 l-4 -8 z" fill={COLORS.terracotta} />
    </svg>
  )
}

function SafariTree({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <ellipse cx="36" cy="66" rx="24" ry="5" fill="#C4B48A" />
      <path d="M36 62 V30" stroke="#8A6A3E" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="36" cy="26" rx="20" ry="16" fill="#6F8F46" />
      <ellipse cx="22" cy="30" rx="11" ry="9" fill="#567538" />
      <ellipse cx="50" cy="30" rx="11" ry="9" fill="#7FA04E" />
      <circle cx="28" cy="22" r="2.2" fill="#E8C97A" />
      <circle cx="42" cy="20" r="2" fill="#E8C97A" />
      <path d="M12 52 Q8 40 14 36 Q10 48 12 52" fill="#C9A24A" />
      <path d="M16 50 Q14 42 18 38" fill="none" stroke="#8A6A3E" strokeWidth="1.6" />
      <path d="M60 54 Q64 42 58 38 Q62 50 60 54" fill="#C9A24A" />
      <circle cx="13" cy="36" r="2.2" fill="#5A4630" />
      <circle cx="59" cy="38" r="2.2" fill="#5A4630" />
    </svg>
  )
}

function UtopiaShip({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 72" aria-hidden>
      <path d="M70 10 L74 28 L68 26 Z" fill="#8A93A3" />
      <path d="M72 6 L73 18" stroke="#C45C3E" strokeWidth="2.2" />
      <circle cx="73" cy="6" r="3.2" fill={COLORS.terracotta} />
      <path d="M6 44 L16 58 H70 L82 42 Z" fill="#1A3354" />
      <path d="M18 42 H68 L74 36 H24 Z" fill="#F4F1E8" stroke={COLORS.navy} strokeWidth="1.2" />
      <rect x="28" y="24" width="32" height="14" rx="2" fill="#EEF3F7" stroke={COLORS.navy} strokeWidth="1.1" />
      <rect x="34" y="14" width="8" height="10" fill={COLORS.terracotta} />
      <rect x="46" y="16" width="7" height="8" fill={COLORS.navy} />
      <circle cx="32" cy="48" r="2" fill={COLORS.gold} />
      <circle cx="42" cy="48" r="2" fill={COLORS.gold} />
      <circle cx="52" cy="48" r="2" fill={COLORS.gold} />
      <path d="M4 62 Q24 56 44 62 T84 60" fill="none" stroke={COLORS.blue} strokeWidth="3" />
    </svg>
  )
}

function CocoCay({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 72" aria-hidden>
      <ellipse cx="40" cy="60" rx="30" ry="8" fill="#E8D5A8" />
      <path d="M4 58 Q28 50 52 58 T80 56 V72 H4 Z" fill="#5B8FA8" />
      <path d="M18 48 h16 v14 h-16 z" fill="#E07A3D" />
      <path d="M16 48 L26 38 L36 48" fill="#C45C3E" />
      <path d="M36 50 h16 v12 h-16 z" fill="#F2E6C9" />
      <path d="M34 50 L44 40 L54 50" fill="#7FA860" />
      <path d="M52 52 h12 v10 h-12 z" fill="#5B8FA8" />
      <path d="M50 52 L58 44 L66 52" fill="#1E3A5F" />
      <path d="M64 40 V58" stroke={COLORS.brown} strokeWidth="2.4" />
      <path d="M64 40 Q52 30 50 40 Q58 36 64 42" fill={COLORS.sage} />
      <path d="M64 40 Q76 28 78 40 Q70 36 64 42" fill="#6B9450" />
    </svg>
  )
}

function MiamiSkyline({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 72" aria-hidden>
      <circle cx="64" cy="14" r="8" fill={COLORS.gold} />
      <rect x="10" y="22" width="12" height="32" fill="#7A8BA0" />
      <rect x="24" y="14" width="14" height="40" fill="#1E3A5F" />
      <rect x="40" y="20" width="10" height="34" fill="#5B8FA8" />
      <rect x="52" y="26" width="12" height="28" fill="#3D5A78" />
      <rect x="14" y="28" width="4" height="4" fill={COLORS.gold} opacity="0.8" />
      <rect x="28" y="20" width="4" height="4" fill={COLORS.gold} opacity="0.8" />
      <path d="M4 56 Q22 50 40 56 T80 54 V72 H4 Z" fill="#5B8FA8" />
      <path d="M4 54 Q22 60 40 54 T80 56" fill="none" stroke={COLORS.sand} strokeWidth="3" />
    </svg>
  )
}

function EpcotSphere({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="36" r="22" fill="#D9E6EE" stroke={COLORS.navy} strokeWidth="1.6" />
      <ellipse cx="36" cy="36" rx="22" ry="8" fill="none" stroke={COLORS.navy} strokeWidth="1.1" />
      <ellipse cx="36" cy="36" rx="8" ry="22" fill="none" stroke={COLORS.navy} strokeWidth="1.1" />
      <path d="M16 28 Q36 22 56 28" fill="none" stroke={COLORS.navy} strokeWidth="1" />
      <path d="M16 44 Q36 50 56 44" fill="none" stroke={COLORS.navy} strokeWidth="1" />
      <rect x="34" y="56" width="4" height="8" fill={COLORS.navy} />
    </svg>
  )
}

function Villa({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path d="M10 36 L36 16 L62 36" fill={COLORS.terracotta} />
      <rect x="16" y="36" width="40" height="24" fill={COLORS.white} stroke={COLORS.navy} strokeWidth="1.5" />
      <rect x="22" y="42" width="10" height="10" fill={COLORS.blue} opacity="0.7" />
      <rect x="40" y="44" width="10" height="16" fill={COLORS.navy} />
      <ellipse cx="54" cy="58" rx="10" ry="5" fill={COLORS.blue} />
    </svg>
  )
}

function Hotel({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <rect x="16" y="14" width="40" height="48" rx="2" fill={COLORS.white} stroke={COLORS.navy} strokeWidth="1.6" />
      <rect x="22" y="22" width="8" height="8" fill={COLORS.gold} />
      <rect x="34" y="22" width="8" height="8" fill={COLORS.gold} />
      <rect x="46" y="22" width="8" height="8" fill={COLORS.gold} />
      <rect x="22" y="36" width="8" height="8" fill={COLORS.gold} />
      <rect x="34" y="36" width="8" height="8" fill={COLORS.gold} />
      <rect x="46" y="36" width="8" height="8" fill={COLORS.gold} />
      <rect x="32" y="48" width="10" height="14" fill={COLORS.navy} />
    </svg>
  )
}

function Plane({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path
        d="M10 38 L44 32 L62 18 L66 22 L50 36 L60 48 L52 50 L42 40 L28 52 L22 48 L32 36 Z"
        fill={COLORS.navy}
      />
      <circle cx="20" cy="56" r="6" fill={COLORS.sand} />
    </svg>
  )
}

function Ship({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path d="M8 44 L16 58 H56 L64 44 Z" fill={COLORS.navy} />
      <rect x="22" y="26" width="28" height="18" rx="2" fill={COLORS.white} stroke={COLORS.navy} strokeWidth="1.4" />
      <rect x="28" y="14" width="8" height="12" fill={COLORS.terracotta} />
      <rect x="40" y="16" width="6" height="10" fill={COLORS.terracotta} />
      <path d="M8 62 Q24 56 36 62 T64 62" fill="none" stroke={COLORS.blue} strokeWidth="3" />
    </svg>
  )
}

function Palms({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path d="M34 28 Q20 18 12 28 Q24 26 34 32" fill={COLORS.sage} />
      <path d="M38 28 Q52 16 62 28 Q50 26 38 32" fill={COLORS.sage} />
      <path d="M36 28 Q36 12 28 10 Q38 16 36 28" fill="#6B9450" />
      <path d="M36 28 V60" stroke={COLORS.brown} strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="36" cy="62" rx="18" ry="5" fill={COLORS.sand} />
    </svg>
  )
}

function Beach({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <circle cx="54" cy="16" r="10" fill={COLORS.gold} />
      <path d="M18 48 Q28 20 36 48" fill="none" stroke={COLORS.brown} strokeWidth="3" />
      <path d="M36 28 Q18 24 14 36 Q26 32 36 34" fill={COLORS.sage} />
      <path d="M8 58 Q24 50 40 58 T72 58 V72 H8 Z" fill={COLORS.blue} />
      <path d="M8 54 Q24 60 40 54 T72 54" fill="none" stroke={COLORS.sand} strokeWidth="4" />
    </svg>
  )
}

function Car({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path d="M10 40 L18 28 H42 L58 40 V52 H10 Z" fill={COLORS.navy} />
      <rect x="22" y="30" width="16" height="10" fill={COLORS.blue} opacity="0.8" />
      <circle cx="22" cy="52" r="7" fill={COLORS.brown} />
      <circle cx="50" cy="52" r="7" fill={COLORS.brown} />
      <circle cx="22" cy="52" r="3" fill={COLORS.sand} />
      <circle cx="50" cy="52" r="3" fill={COLORS.sand} />
    </svg>
  )
}

function Meal({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <ellipse cx="36" cy="40" rx="22" ry="8" fill={COLORS.white} stroke={COLORS.navy} strokeWidth="1.5" />
      <ellipse cx="36" cy="34" rx="16" ry="10" fill={COLORS.terracotta} />
      <path d="M20 28 Q36 12 52 28" fill="none" stroke={COLORS.sage} strokeWidth="3" />
    </svg>
  )
}

function RestMoon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <circle cx="36" cy="36" r="20" fill={COLORS.gold} />
      <circle cx="44" cy="30" r="16" fill={COLORS.cream} />
    </svg>
  )
}

function PinHouse({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <path d="M36 8 C22 8 14 20 14 32 C14 48 36 64 36 64 S58 48 58 32 C58 20 50 8 36 8 Z" fill={COLORS.terracotta} />
      <circle cx="36" cy="30" r="10" fill={COLORS.cream} />
    </svg>
  )
}

function glyphKeyForPlace(placeKey?: string, kind?: GlyphKind): string {
  const k = (placeKey ?? '').toLowerCase()
  if (/magic kingdom|efteling|castle/.test(k)) return 'castle'
  if (/animal kingdom|beekse|safari/.test(k)) return 'safari'
  if (/cococay|perfect day/.test(k)) return 'cococay'
  if (/epcot|spaceship earth/.test(k)) return 'epcot'
  if (/miami beach|מיאמי/.test(k)) return 'miami'
  if (/solterra|davenport/.test(k)) return 'villa'
  if (/holiday inn/.test(k)) return 'hotel'
  if (/utopia|canaveral/.test(k)) return 'utopia'
  if (/airport|mia|gurion|נתב|schiphol|fiumicino|cdg|de gaulle/.test(k)) return 'plane'
  switch (kind) {
    case 'park': return 'castle'
    case 'island': return 'cococay'
    case 'beach': return 'miami'
    case 'villa': return 'villa'
    case 'hotel': return 'hotel'
    case 'port':
    case 'ship': return 'utopia'
    case 'airport': return 'plane'
    case 'transport': return 'car'
    case 'meal': return 'meal'
    case 'rest': return 'rest'
    default: return 'pin'
  }
}

export default function LandmarkGlyph({ kind, placeKey, selected = false, size = 56 }: Props) {
  const glyph = glyphKeyForPlace(placeKey, kind)
  const style = selected ? { filter: 'drop-shadow(0 2px 6px rgba(42,32,19,0.35))' } : undefined
  const inner =
    glyph === 'castle' ? <Castle size={size} />
    : glyph === 'safari' ? <SafariTree size={size} />
    : glyph === 'utopia' ? <UtopiaShip size={size} />
    : glyph === 'cococay' ? <CocoCay size={size} />
    : glyph === 'miami' ? <MiamiSkyline size={size} />
    : glyph === 'epcot' ? <EpcotSphere size={size} />
    : glyph === 'villa' ? <Villa size={size} />
    : glyph === 'hotel' ? <Hotel size={size} />
    : glyph === 'plane' ? <Plane size={size} />
    : glyph === 'ship' ? <Ship size={size} />
    : glyph === 'palms' ? <Palms size={size} />
    : glyph === 'beach' ? <Beach size={size} />
    : glyph === 'car' ? <Car size={size} />
    : glyph === 'meal' ? <Meal size={size} />
    : glyph === 'rest' ? <RestMoon size={size} />
    : <PinHouse size={size} />
  return <span style={{ display: 'inline-flex', ...style }}>{inner}</span>
}
