// Image analysis for merchandise reconstruction.
//
// Pure functions over RGBA pixel arrays, shared by the browser viewer and
// scripts/reconstruct-merch.mjs (Node runs this file directly via type stripping,
// so it must stay dependency-free and use only erasable TypeScript syntax).

export type RGB = [number, number, number]

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Component extends Box {
  area: number
}

export interface Analysis {
  width: number
  height: number
  /** Dominant border colour. */
  bg: RGB
  /** Share of border pixels within tolerance of `bg` (1 = perfectly flat background). */
  borderUniformity: number
  /** Foreground components (not connected to the background), largest first. */
  components: Component[]
  /** Share of the image covered by background. */
  backgroundShare: number
}

/** Largest per-channel difference between pixel i and a colour. */
export function colorDistance(data: Uint8ClampedArray | Uint8Array, i: number, c: RGB): number {
  return Math.max(Math.abs(data[i] - c[0]), Math.abs(data[i + 1] - c[1]), Math.abs(data[i + 2] - c[2]))
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}

/** Median colour of the outer border and how much of the border matches it. */
export function borderStats(data: Uint8ClampedArray | Uint8Array, w: number, h: number, tol: number): { bg: RGB; uniformity: number } {
  const idx: number[] = []
  const step = Math.max(1, Math.floor(Math.max(w, h) / 400))
  for (let x = 0; x < w; x += step) idx.push(x * 4, ((h - 1) * w + x) * 4)
  for (let y = 0; y < h; y += step) idx.push(y * w * 4, (y * w + w - 1) * 4)
  const bg: RGB = [median(idx.map((i) => data[i])), median(idx.map((i) => data[i + 1])), median(idx.map((i) => data[i + 2]))]
  const near = idx.filter((i) => colorDistance(data, i, bg) <= tol).length
  return { bg, uniformity: near / idx.length }
}

/**
 * 1 = background: pixels within `tol` of `bg` that are connected to the image border
 * (enclosed light areas inside the artwork stay foreground).
 */
export function backgroundMask(data: Uint8ClampedArray | Uint8Array, w: number, h: number, bg: RGB, tol: number): Uint8Array {
  const out = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0
  const push = (p: number) => {
    if (out[p] === 0 && colorDistance(data, p * 4, bg) <= tol) {
      out[p] = 1
      stack[sp++] = p
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (sp > 0) {
    const p = stack[--sp]
    const x = p % w
    const y = (p - x) / w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w)
    if (y < h - 1) push(p + w)
  }
  return out
}

/** Connected foreground components (4-connectivity). `fg` uses 1 for foreground. */
export function labelComponents(fg: Uint8Array, w: number, h: number): { labels: Int32Array; components: (Component & { label: number })[] } {
  const labels = new Int32Array(w * h)
  const components: (Component & { label: number })[] = []
  const stack = new Int32Array(w * h)
  let next = 1
  for (let start = 0; start < w * h; start++) {
    if (!fg[start] || labels[start]) continue
    const label = next++
    const c = { label, x0: w, y0: h, x1: 0, y1: 0, area: 0 }
    let sp = 0
    stack[sp++] = start
    labels[start] = label
    while (sp > 0) {
      const p = stack[--sp]
      const x = p % w
      const y = (p - x) / w
      c.area++
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of nb) {
        if (q >= 0 && fg[q] && !labels[q]) {
          labels[q] = label
          stack[sp++] = q
        }
      }
    }
    components.push(c)
  }
  components.sort((a, b) => b.area - a.area)
  return { labels, components }
}

/** Full analysis: background colour, uniformity and the foreground pieces. */
export function analyzeRGBA(data: Uint8ClampedArray | Uint8Array, w: number, h: number, tol = 26): Analysis {
  const { bg, uniformity } = borderStats(data, w, h, tol)
  const bgMask = backgroundMask(data, w, h, bg, tol)
  const fg = new Uint8Array(w * h)
  let bgCount = 0
  for (let i = 0; i < fg.length; i++) {
    fg[i] = bgMask[i] ? 0 : 1
    bgCount += bgMask[i]
  }
  const minArea = w * h * 0.002
  const { components } = labelComponents(fg, w, h)
  return {
    width: w,
    height: h,
    bg,
    borderUniformity: uniformity,
    backgroundShare: bgCount / (w * h),
    components: components.filter((c) => c.area >= minArea).map(({ x0, y0, x1, y1, area }) => ({ x0, y0, x1, y1, area })),
  }
}

/** Binary dilation with a square structuring element of radius r. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    let run = -1
    for (let x = 0; x < w; x++) if (mask[y * w + x]) run = x + r; else if (x <= run) tmp[y * w + x] = 1
    run = w + r
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) {
        tmp[y * w + x] = 1
        run = x - r
      } else if (x >= run) tmp[y * w + x] = 1
    }
  }
  for (let x = 0; x < w; x++) {
    let run = -1
    for (let y = 0; y < h; y++) if (tmp[y * w + x]) run = y + r; else if (y <= run) out[y * w + x] = 1
    run = h + r
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) {
        out[y * w + x] = 1
        run = y - r
      } else if (y >= run) out[y * w + x] = 1
    }
  }
  return out
}

/**
 * Outer contour of a binary mask (Moore-neighbour tracing), as pixel-corner points.
 * The mask should contain one component; holes are ignored.
 */
export function traceOutline(mask: Uint8Array, w: number, h: number): [number, number][] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1
  let sx = -1
  let sy = -1
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y)) {
        sx = x
        sy = y
        break outer
      }
    }
  }
  if (sx < 0) return []
  // 8 neighbours, clockwise starting West
  const dirs: [number, number][] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]
  const pts: [number, number][] = []
  let cx = sx
  let cy = sy
  let back = 0 // the start pixel is the first in scan order, so its west neighbour is background
  let firstDir = -1
  const limit = w * h * 4
  for (let n = 0; n < limit; n++) {
    let d = -1
    for (let k = 1; k <= 8; k++) {
      const t = (back + k) % 8
      if (at(cx + dirs[t][0], cy + dirs[t][1])) {
        d = t
        break
      }
    }
    if (d < 0) return [[sx, sy]] // isolated pixel
    // Jacob's stopping criterion: back at the start, about to repeat the first move.
    if (cx === sx && cy === sy) {
      if (firstDir === d) break
      if (firstDir < 0) firstDir = d
    }
    pts.push([cx, cy])
    cx += dirs[d][0]
    cy += dirs[d][1]
    // Continue scanning from the neighbour just before the one we moved to (seen from the new pixel).
    back = (d + 5) % 8
  }
  return pts
}

/** Ramer–Douglas–Peucker polyline simplification (closed outline). */
export function simplify(points: [number, number][], eps: number): [number, number][] {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let maxD = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Average colour of the foreground pixels near a component's edge (badge rims, scroll fabric). */
export function edgeColor(data: Uint8ClampedArray | Uint8Array, w: number, box: Box): RGB {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const rx = (box.x1 - box.x0) / 2
  const ry = (box.y1 - box.y0) / 2
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 48) {
    const x = Math.round(cx + Math.cos(a) * rx * 0.9)
    const y = Math.round(cy + Math.sin(a) * ry * 0.9)
    const i = (y * w + x) * 4
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    n++
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}
