/**
 * Placeholder mascot illustration for the warm-theme hero card.
 * Hand-drawn flat SVG — no image-generation tool is available in this
 * environment, so this stands in for a commissioned/AI-painted illustration.
 * Swap for real artwork later (see feat/warm-illustrated-redesign).
 */
export default function TripMascot({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 220 172" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="72" cy="152" rx="34" ry="7" fill="#E2953A" opacity="0.14" />
      <ellipse cx="148" cy="152" rx="34" ry="7" fill="#D9607E" opacity="0.14" />

      {/* backpacks (behind bodies) */}
      <rect x="34" y="88" width="20" height="30" rx="8" fill="#C56A22" opacity="0.55" transform="rotate(-8 44 103)" />
      <rect x="166" y="86" width="20" height="30" rx="8" fill="#8F6FC2" opacity="0.5" transform="rotate(8 176 101)" />

      {/* figure 1 — boy, jacket + jump pose */}
      <g>
        <path d="M56 148 L60 122 L52 108 L46 122 L48 148 Z" fill="#F5CE8F" />
        <path d="M50 108 Q72 96 74 122 L70 148 L54 148 L50 122 Z" fill="#EDB35C" />
        <path d="M50 108 Q52 118 44 128" stroke="#F6D9B7" strokeWidth="8" strokeLinecap="round" />
        <path d="M74 122 Q86 112 92 100" stroke="#F6D9B7" strokeWidth="8" strokeLinecap="round" />
        <circle cx="63" cy="60" r="24" fill="#F6D9B7" />
        <path d="M40 54 Q42 32 63 32 Q84 32 86 54 Q72 44 63 46 Q54 44 40 54 Z" fill="#54452F" />
        <circle cx="54" cy="62" r="2.6" fill="#3D3120" />
        <circle cx="72" cy="62" r="2.6" fill="#3D3120" />
        <circle cx="50" cy="68" r="4" fill="#E8899E" opacity="0.55" />
        <circle cx="76" cy="68" r="4" fill="#E8899E" opacity="0.55" />
        <path d="M55 71 Q63 77 71 71" stroke="#3D3120" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </g>

      {/* figure 2 — friend, jump pose, hands meeting in a high-five above center */}
      <g>
        <path d="M158 148 L154 122 L162 108 L168 122 L166 148 Z" fill="#C9B6E8" />
        <path d="M146 108 Q124 96 122 122 L126 148 L142 148 L146 122 Z" fill="#8F6FC2" opacity="0.85" />
        <path d="M146 108 Q144 118 152 128" stroke="#F6D9B7" strokeWidth="8" strokeLinecap="round" />
        <path d="M122 122 Q110 112 104 100" stroke="#F6D9B7" strokeWidth="8" strokeLinecap="round" />
        <circle cx="133" cy="60" r="24" fill="#F6D9B7" />
        <path d="M110 52 Q108 30 133 30 Q156 30 156 52 Q146 36 133 40 Q120 36 110 52 Z" fill="#3D3120" />
        <circle cx="124" cy="62" r="2.6" fill="#3D3120" />
        <circle cx="142" cy="62" r="2.6" fill="#3D3120" />
        <circle cx="120" cy="68" r="4" fill="#E8899E" opacity="0.55" />
        <circle cx="146" cy="68" r="4" fill="#E8899E" opacity="0.55" />
        <path d="M125 71 Q133 77 141 71" stroke="#3D3120" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </g>

      {/* joined hands above center */}
      <circle cx="98" cy="97" r="7" fill="#F6D9B7" />

      {/* sparkles */}
      <path d="M18 44 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="#EDB35C" opacity="0.75" />
      <path d="M200 108 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5 Z" fill="#D9607E" opacity="0.6" />
      <circle cx="190" cy="42" r="3.4" fill="#7FA860" opacity="0.7" />
      <circle cx="30" cy="100" r="2.6" fill="#8F6FC2" opacity="0.6" />
    </svg>
  )
}
