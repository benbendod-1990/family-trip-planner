/**
 * Collision-aware chip placement for scrapbook maps.
 *
 * Layout math is in viewBox units. Chip sizes are estimated in CSS pixels at a
 * 390px-wide phone, then converted so labels that look fine on iPhone don't
 * secretly overlap in viewBox space (the failure mode of PR #18).
 */

export const MAP_PHONE_CSS_WIDTH = 390

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type LabelSide = 'start' | 'end' | 'above' | 'below'

export interface ChipAnchor {
  id: string
  ax: number
  ay: number
  text: string
  /** Preferred label-center offset from the anchor, in viewBox units. */
  preferDx?: number
  preferDy?: number
}

export interface PlacedChip {
  id: string
  text: string
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  side: LabelSide
  leader: { x1: number; y1: number; x2: number; y2: number }
}

export function cssPxToView(px: number, viewWidth: number, cssWidth = MAP_PHONE_CSS_WIDTH): number {
  return px * (viewWidth / cssWidth)
}

export function rectsOverlap(a: Rect, b: Rect, gap = 8): boolean {
  return (
    a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y
  )
}

export function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  rect: Rect,
  gap = 6,
): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w))
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h))
  return Math.hypot(cx - nx, cy - ny) < r + gap
}

export function closestPointOnRect(px: number, py: number, rect: Rect): { x: number; y: number } {
  return {
    x: Math.max(rect.x, Math.min(px, rect.x + rect.w)),
    y: Math.max(rect.y, Math.min(py, rect.y + rect.h)),
  }
}

/** First clause of a title, then hard-cap so map chips stay short. */
export function shortMapLabel(title: string, max = 20): string {
  let t = title.replace(/\s+/g, ' ').trim()
  const cut = t.split(/\s*[,+(–—|/]\s*/)[0]?.trim() ?? t
  if (cut.length >= 6) t = cut
  const chars = [...t]
  if (chars.length <= max) return t
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

export function estimateChipSizeCss(text: string): { w: number; h: number } {
  let w = 18
  for (const ch of [...text]) {
    if (/[\u0590-\u05FF]/.test(ch)) w += 7.2
    else if (/[A-Z0-9]/.test(ch)) w += 7.4
    else w += 6.2
  }
  return { w: Math.min(168, Math.max(40, w)), h: 24 }
}

function sideFromOffset(dx: number, dy: number): LabelSide {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'end' : 'start'
  return dy >= 0 ? 'below' : 'above'
}

function inBounds(rect: Rect, view: { width: number; height: number }, margin: number): boolean {
  return (
    rect.x >= margin
    && rect.y >= margin
    && rect.x + rect.w <= view.width - margin
    && rect.y + rect.h <= view.height - margin
  )
}

function candidateOffsets(
  preferDx: number | undefined,
  preferDy: number | undefined,
  iconR: number,
): Array<{ dx: number; dy: number }> {
  const dist = iconR + 36
  const ring: Array<{ dx: number; dy: number }> = []
  const dirs = [
    [0, -1], [1, 0], [-1, 0], [0, 1],
    [0.78, -0.78], [-0.78, -0.78], [0.78, 0.78], [-0.78, 0.78],
    [1.45, -0.35], [-1.45, -0.35], [1.45, 0.35], [-1.45, 0.35],
    [0.35, -1.45], [-0.35, -1.45], [0.35, 1.45], [-0.35, 1.45],
    [1.85, 0], [-1.85, 0], [0, -1.85], [0, 1.85],
    [2.3, 0.4], [-2.3, 0.4], [2.3, -0.4], [-2.3, -0.4],
    [0.5, 2.2], [-0.5, 2.2], [0.5, -2.2], [-0.5, -2.2],
  ]
  for (const scale of [1, 1.35, 1.75]) {
    for (const [ox, oy] of dirs) {
      ring.push({ dx: ox * dist * scale, dy: oy * dist * scale })
    }
  }
  if (preferDx != null && preferDy != null) {
    return [
      { dx: preferDx, dy: preferDy },
      { dx: preferDx * 1.3, dy: preferDy * 1.3 },
      { dx: preferDx * 1.6, dy: preferDy * 0.4 },
      { dx: preferDx * 0.4, dy: preferDy * 1.6 },
      { dx: -preferDx, dy: -preferDy },
      ...ring,
    ]
  }
  return ring
}

function scoreCandidate(
  rect: Rect,
  view: { width: number; height: number },
  icons: Array<{ x: number; y: number; r: number }>,
  placed: Rect[],
  obstacles: Rect[],
  gap: number,
): number {
  if (!inBounds(rect, view, 6)) return -1e6
  let score = 0
  for (const icon of icons) {
    if (circleHitsRect(icon.x, icon.y, icon.r, rect, gap)) score -= 400
  }
  for (const other of placed) {
    if (rectsOverlap(rect, other, gap)) score -= 500
  }
  for (const obs of obstacles) {
    if (rectsOverlap(rect, obs, gap)) score -= 250
  }
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const edge = Math.min(cx, cy, view.width - cx, view.height - cy)
  score += Math.min(40, edge * 0.15)
  return score
}

/**
 * Place short title chips around anchors so they don't sit on icons or each other.
 * Full blurbs belong in a sheet, not on the canvas.
 */
export function placeMapChips(
  items: ChipAnchor[],
  view: { width: number; height: number },
  opts?: {
    iconR?: number
    gap?: number
    obstacles?: Rect[]
    cssWidth?: number
  },
): PlacedChip[] {
  const cssWidth = opts?.cssWidth ?? MAP_PHONE_CSS_WIDTH
  const iconR = opts?.iconR ?? cssPxToView(26, view.width, cssWidth)
  const gap = opts?.gap ?? cssPxToView(6, view.width, cssWidth)
  const obstacles = opts?.obstacles ?? []
  const icons = items.map(it => ({ x: it.ax, y: it.ay, r: iconR }))
  const placedRects: Rect[] = []
  const out: PlacedChip[] = []

  for (const item of items) {
    const css = estimateChipSizeCss(item.text)
    const w = cssPxToView(css.w, view.width, cssWidth)
    const h = cssPxToView(css.h, view.width, cssWidth)
    const offsets = candidateOffsets(item.preferDx, item.preferDy, iconR)
    let best: { rect: Rect; score: number; dx: number; dy: number } | null = null
    for (const off of offsets) {
      const rect: Rect = {
        x: item.ax + off.dx - w / 2,
        y: item.ay + off.dy - h / 2,
        w,
        h,
      }
      const score = scoreCandidate(rect, view, icons, placedRects, obstacles, gap)
      if (!best || score > best.score) best = { rect, score, dx: off.dx, dy: off.dy }
    }
    const rect = best?.rect ?? {
      x: Math.max(8, Math.min(view.width - w - 8, item.ax - w / 2)),
      y: Math.max(8, Math.min(view.height - h - 8, item.ay - h - iconR)),
      w,
      h,
    }
    // Nudge out of remaining overlaps with already-placed chips.
    for (let round = 0; round < 16; round++) {
      let moved = false
      for (const other of placedRects) {
        if (!rectsOverlap(rect, other, gap)) continue
        const ocx = other.x + other.w / 2
        const ocy = other.y + other.h / 2
        const cx = rect.x + rect.w / 2
        const cy = rect.y + rect.h / 2
        let dx = cx - ocx
        let dy = cy - ocy
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        rect.x += dx * 18
        rect.y += dy * 18
        moved = true
      }
      rect.x = Math.max(6, Math.min(view.width - rect.w - 6, rect.x))
      rect.y = Math.max(6, Math.min(view.height - rect.h - 6, rect.y))
      if (!moved) break
    }
    placedRects.push(rect)
    out.push(chipFromRect(item, rect))
  }

  for (let round = 0; round < 40; round++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]
        const b = out[j]
        if (!rectsOverlap(a, b, gap)) continue
        let dx = a.cx - b.cx
        let dy = a.cy - b.cy
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          dx = 1
          dy = 0
        }
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        a.x += dx * 18
        a.y += dy * 18
        b.x -= dx * 18
        b.y -= dy * 18
        clampChip(a, view)
        clampChip(b, view)
        moved = true
      }
      const item = items[i]
      if (item && circleHitsRect(item.ax, item.ay, iconR, out[i], gap)) {
        let dx = out[i].cx - item.ax
        let dy = out[i].cy - item.ay
        const len = Math.hypot(dx, dy) || 1
        out[i].x += (dx / len) * 14
        out[i].y += (dy / len) * 14
        clampChip(out[i], view)
        moved = true
      }
    }
    if (!moved) break
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = chipFromRect(items[i], out[i])
  }
  return out
}

function clampChip(chip: PlacedChip, view: { width: number; height: number }) {
  chip.x = Math.max(6, Math.min(view.width - chip.w - 6, chip.x))
  chip.y = Math.max(6, Math.min(view.height - chip.h - 6, chip.y))
  chip.cx = chip.x + chip.w / 2
  chip.cy = chip.y + chip.h / 2
}

function chipFromRect(item: ChipAnchor, rect: Rect): PlacedChip {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const edge = closestPointOnRect(item.ax, item.ay, rect)
  return {
    id: item.id,
    text: item.text,
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    cx,
    cy,
    side: sideFromOffset(cx - item.ax, cy - item.ay),
    leader: { x1: item.ax, y1: item.ay, x2: edge.x, y2: edge.y },
  }
}

export function anyRectsOverlap(rects: Rect[], gap = 4): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j], gap)) return true
    }
  }
  return false
}
