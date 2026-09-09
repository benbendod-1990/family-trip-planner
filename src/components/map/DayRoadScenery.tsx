import type { DayRoadTheme } from '@/lib/tripMapDayStops'

interface Props {
  width: number
  height: number
  theme: DayRoadTheme
  seed: string
}

function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pines(seed: number, width: number, height: number) {
  const trees = []
  for (let i = 0; i < 7; i++) {
    const left = i % 2 === 0
    const x = left ? 36 + (seed + i * 17) % 70 : width - 36 - ((seed + i * 13) % 70)
    const y = 160 + ((seed + i * 53) % Math.max(80, height - 260))
    const s = 0.7 + ((seed + i) % 5) * 0.12
    trees.push(
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`} opacity="0.72">
        <path d="M0 -38 L16 4 H-16 Z" fill="#6B8F52" />
        <path d="M0 -22 L14 12 H-14 Z" fill="#5A7A44" />
        <rect x="-3" y="10" width="6" height="16" fill="#6B4F32" />
      </g>,
    )
  }
  return trees
}

export default function DayRoadScenery({ width, height, theme, seed }: Props) {
  const v = hash(seed)
  const uid = `day-${seed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'x'}`
  const sky = theme === 'sea' || theme === 'island' ? '#cfe0ea'
    : theme === 'disney' ? '#e4eed6'
    : theme === 'airport' ? '#ddd8ea'
    : theme === 'beach' ? '#efe6cc'
    : '#e6dcc4'
  const ground = theme === 'sea' ? '#d7e6c9' : '#d9c9a4'
  const m1 = height * (0.22 + (v % 5) * 0.01)
  const m2 = height * 0.30

  return (
    <g aria-hidden>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky} />
          <stop offset="55%" stopColor={ground} />
          <stop offset="100%" stopColor="#cbb98a" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${uid}-sky)`} />
      <path
        d={`M0 ${m2} L${width * 0.16} ${m1 * 0.55} L${width * 0.32} ${m2 * 0.9} L${width * 0.48} ${m1 * 0.4} L${width * 0.66} ${m2} L${width * 0.82} ${m1 * 0.62} L${width} ${m2} V0 H0 Z`}
        fill="#c5b89a"
        opacity="0.85"
      />
      <path
        d={`M0 ${m2 + 24} L${width * 0.22} ${m1 + 10} L${width * 0.4} ${m2 + 8} L${width * 0.58} ${m1 * 0.85} L${width * 0.78} ${m2 + 18} L${width} ${m1 + 20} V${m2 + 80} H0 Z`}
        fill="#b7c49a"
        opacity="0.7"
      />
      {theme === 'sea' || theme === 'island' || theme === 'beach' ? (
        <>
          <path
            d={`M0 ${height * 0.78} Q${width * 0.25} ${height * 0.74} ${width * 0.5} ${height * 0.8} T${width} ${height * 0.77} V${height} H0 Z`}
            fill="#8fb4c4"
            opacity="0.45"
          />
          <path
            d={`M40 ${height * 0.82} Q120 ${height * 0.79} 200 ${height * 0.83} T360 ${height * 0.82}`}
            fill="none"
            stroke="#5B8FA8"
            strokeWidth="3"
            opacity="0.4"
          />
        </>
      ) : null}
      {theme === 'disney' ? (
        <g transform={`translate(${width - 110} 70)`} opacity="0.55">
          <path d="M-18 48 L0 8 L18 48 Z" fill="#fffdf7" stroke="#1E3A5F" strokeWidth="2" />
          <rect x="-6" y="28" width="12" height="20" fill="#1E3A5F" />
        </g>
      ) : null}
      {theme === 'airport' ? (
        <path d="M70 70 L190 108 L150 58 Z" fill="#1E3A5F" opacity="0.16" />
      ) : null}
      <circle cx={width - 70} cy={64} r="22" fill="#E0B44B" opacity="0.55" />
      {pines(v, width, height)}
      <ellipse cx={width * 0.18} cy={height - 36} rx="90" ry="16" fill="#7FA860" opacity="0.18" />
      <ellipse cx={width * 0.84} cy={height - 50} rx="80" ry="14" fill="#7FA860" opacity="0.16" />
    </g>
  )
}
