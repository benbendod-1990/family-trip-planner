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
      <rect x="10" y="38" width="52" height="26" rx="2" fill={COLORS.white} stroke={COLORS.navy} strokeWidth="1.6" />
      <path d="M22 38 V22 L36 10 L50 22 V38" fill={COLORS.white} stroke={COLORS.navy} strokeWidth="1.6" />
      <rect x="32" y="28" width="8" height="12" rx="1" fill={COLORS.navy} />
      <circle cx="36" cy="24" r="3" fill={COLORS.gold} />
      <path d="M14 38 h10 v-10 h-10 z M48 38 h10 v-10 h-10 z" fill={COLORS.terracotta} stroke={COLORS.navy} strokeWidth="1.2" />
      <rect x="18" y="48" width="8" height="10" fill={COLORS.navy} opacity="0.35" />
      <rect x="46" y="48" width="8" height="10" fill={COLORS.navy} opacity="0.35" />
    </svg>
  )
}

function SafariTree({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden>
      <ellipse cx="36" cy="28" rx="22" ry="18" fill={COLORS.sage} />
      <ellipse cx="24" cy="32" rx="12" ry="10" fill="#6B9450" />
      <ellipse cx="48" cy="32" rx="12" ry="10" fill="#6B9450" />
      <path d="M36 28 V62" stroke={COLORS.brown} strokeWidth="5" strokeLinecap="round" />
      <path d="M36 44 Q24 50 18 58" stroke={COLORS.brown} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="28" cy="24" r="3" fill="#E8C97A" />
      <circle cx="44" cy="22" r="2.5" fill="#E8C97A" />
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
  if (/magic kingdom/.test(k)) return 'castle'
  if (/animal kingdom/.test(k)) return 'safari'
  if (/cococay|perfect day/.test(k)) return 'palms'
  if (/miami beach/.test(k)) return 'beach'
  if (/solterra|davenport/.test(k)) return 'villa'
  if (/holiday inn/.test(k)) return 'hotel'
  if (/canaveral/.test(k)) return 'ship'
  if (/airport|mia|gurion|נתב/.test(k)) return 'plane'
  switch (kind) {
    case 'park': return 'castle'
    case 'island': return 'palms'
    case 'beach': return 'beach'
    case 'villa': return 'villa'
    case 'hotel': return 'hotel'
    case 'port':
    case 'ship': return 'ship'
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
