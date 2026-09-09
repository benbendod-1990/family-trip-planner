/** Decorative scrapbook bits — washi tape and a postage stamp. */
export function WashiTape({ rotate = -12, color = '#C45C3E' }: { rotate?: number; color?: string }) {
  return (
    <svg width="86" height="28" viewBox="0 0 86 28" style={{ transform: `rotate(${rotate}deg)` }} aria-hidden>
      <rect x="1" y="4" width="84" height="20" fill={color} opacity="0.55" />
      <rect x="1" y="4" width="84" height="20" fill="none" stroke={color} strokeWidth="1" opacity="0.8" />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={6 + i * 9} cy="14" r="2.2" fill="#FBF3DF" opacity="0.5" />
      ))}
    </svg>
  )
}

export function PostageStamp({ emoji, caption }: { emoji: string; caption: string }) {
  return (
    <svg width="78" height="90" viewBox="0 0 78 90" aria-hidden>
      <rect x="3" y="3" width="72" height="84" fill="#FFFDF7" stroke="#1E3A5F" strokeWidth="2" strokeDasharray="4 3" />
      <text x="39" y="42" textAnchor="middle" fontSize="28">{emoji}</text>
      <text x="39" y="70" textAnchor="middle" fontSize="9" fill="#1E3A5F" fontFamily="Heebo, sans-serif">{caption}</text>
    </svg>
  )
}
