// Turns a product photo into the inputs of a procedural model: the artwork with a
// transparent background, a white silhouette (the white ink layer behind acrylic prints)
// and the outline of the piece for extrusion.
import { backgroundMask, dilate, edgeColor, labelComponents, simplify, traceOutline, type RGB } from '@/lib/reconstruct/analyze'

export type ReconstructionMethod = 'acrylic_stand' | 'acrylic_charm' | 'badge' | 'flat_print' | 'wall_scroll'

export interface ModelParams {
  method: ReconstructionMethod
  /** Normalised crop [x0, y0, x1, y1] of the piece inside the photo; null = whole photo. */
  crop: [number, number, number, number] | null
  /** Background colour of the photo and colour tolerance (cut-out methods). */
  bg?: RGB | null
  tol?: number
  /** Real-world size in cm: plate / print height, or badge diameter. */
  size_cm: number
  finish?: 'paper' | 'board' | 'gold_board' | 'clear' | 'card'
  thickness_mm?: number
}

export interface ProcessedArt {
  /** Artwork; transparent outside the piece for cut-out methods. */
  art: HTMLCanvasElement
  /** White silhouette with the same alpha. */
  silhouette: HTMLCanvasElement
  /** Outline (normalised 0..1, y down) of the dilated piece, for extruded acrylic. */
  outline: [number, number][]
  aspect: number
  edge: RGB
}

const MAX_SIDE = 1024

export function isModelParams(v: unknown): v is ModelParams {
  const p = v as ModelParams | null
  return !!p && typeof p === 'object' && typeof p.method === 'string' && typeof p.size_cm === 'number'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The product photo could not be loaded.'))
    img.src = url
  })
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export async function processArt(url: string, p: ModelParams): Promise<ProcessedArt> {
  const img = await loadImage(url)
  const W = img.naturalWidth
  const H = img.naturalHeight
  const pad = 0.02
  const [nx0, ny0, nx1, ny1] = p.crop ?? [0, 0, 1, 1]
  const sx = Math.max(0, Math.floor((nx0 - (p.crop ? pad : 0)) * W))
  const sy = Math.max(0, Math.floor((ny0 - (p.crop ? pad : 0)) * H))
  const ex = Math.min(W, Math.ceil((nx1 + (p.crop ? pad : 0)) * W))
  const ey = Math.min(H, Math.ceil((ny1 + (p.crop ? pad : 0)) * H))
  const scale = Math.min(1, MAX_SIDE / Math.max(ex - sx, ey - sy))
  let w = Math.max(2, Math.round((ex - sx) * scale))
  let h = Math.max(2, Math.round((ey - sy) * scale))

  const src = canvas(w, h)
  const ctx = src.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, sx, sy, ex - sx, ey - sy, 0, 0, w, h)
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    throw new Error('The photo host does not allow it to be used for a 3D texture.')
  }

  const cutout = p.method === 'acrylic_stand' || p.method === 'acrylic_charm' || p.method === 'badge'
  if (!cutout || !p.bg) {
    const sil = canvas(w, h)
    const sctx = sil.getContext('2d')!
    sctx.fillStyle = '#ffffff'
    sctx.fillRect(0, 0, w, h)
    return {
      art: src,
      silhouette: sil,
      outline: [[0, 0], [1, 0], [1, 1], [0, 1]],
      aspect: w / h,
      edge: edgeColor(data.data, w, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 }),
    }
  }

  // Cut the piece out: background connected to the crop border, keep the largest piece.
  const bgMask = backgroundMask(data.data, w, h, p.bg, p.tol ?? 26)
  const fg = new Uint8Array(w * h)
  for (let i = 0; i < fg.length; i++) fg[i] = bgMask[i] ? 0 : 1
  const { labels, components } = labelComponents(fg, w, h)
  const main = components[0]
  if (!main || main.area < w * h * 0.03) throw new Error('The piece could not be separated from the photo background.')
  let mask = new Uint8Array(w * h)
  for (let i = 0; i < mask.length; i++) mask[i] = labels[i] === main.label ? 1 : 0

  // Tighten the canvas to the piece.
  const m = 2
  const bx0 = Math.max(0, main.x0 - m)
  const by0 = Math.max(0, main.y0 - m)
  const bx1 = Math.min(w - 1, main.x1 + m)
  const by1 = Math.min(h - 1, main.y1 + m)
  const tw = bx1 - bx0 + 1
  const th = by1 - by0 + 1

  if (p.method === 'badge') {
    // Badges are round: keep the inscribed circle of the piece.
    const side = Math.min(tw, th)
    const ox = bx0 + Math.floor((tw - side) / 2)
    const oy = by0 + Math.floor((th - side) / 2)
    const art = canvas(side, side)
    const actx = art.getContext('2d')!
    actx.drawImage(src, ox, oy, side, side, 0, 0, side, side)
    return {
      art,
      silhouette: art,
      outline: [],
      aspect: 1,
      edge: edgeColor(data.data, w, { x0: ox, y0: oy, x1: ox + side - 1, y1: oy + side - 1 }),
    }
  }

  const crop = new Uint8Array(tw * th)
  const out = new ImageData(tw, th)
  const silData = new ImageData(tw, th)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = (by0 + y) * w + (bx0 + x)
      const di = y * tw + x
      const on = mask[si]
      crop[di] = on
      out.data[di * 4] = data.data[si * 4]
      out.data[di * 4 + 1] = data.data[si * 4 + 1]
      out.data[di * 4 + 2] = data.data[si * 4 + 2]
      out.data[di * 4 + 3] = on ? 255 : 0
      silData.data[di * 4] = 246
      silData.data[di * 4 + 1] = 246
      silData.data[di * 4 + 2] = 244
      silData.data[di * 4 + 3] = on ? 255 : 0
    }
  }
  mask = crop
  w = tw
  h = th
  const art = canvas(w, h)
  art.getContext('2d')!.putImageData(out, 0, 0)
  const silhouette = canvas(w, h)
  silhouette.getContext('2d')!.putImageData(silData, 0, 0)

  // Outline of the acrylic: a small downscaled copy, dilated (acrylic margin around the print).
  const os = Math.min(1, 240 / Math.max(w, h))
  const ow = Math.max(4, Math.round(w * os))
  const oh = Math.max(4, Math.round(h * os))
  const small = new Uint8Array(ow * oh)
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const X0 = Math.floor(x / os)
      const Y0 = Math.floor(y / os)
      const X1 = Math.min(w - 1, Math.floor((x + 1) / os))
      const Y1 = Math.min(h - 1, Math.floor((y + 1) / os))
      let on = 0
      for (let yy = Y0; yy <= Y1 && !on; yy++) for (let xx = X0; xx <= X1 && !on; xx++) on = mask[yy * w + xx]
      small[y * ow + x] = on
    }
  }
  const margin = Math.max(1, Math.round(Math.max(ow, oh) * 0.02))
  // Pad so the dilated outline is not clipped by the canvas edge.
  const pw = ow + margin * 2 + 2
  const ph = oh + margin * 2 + 2
  const padded = new Uint8Array(pw * ph)
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) padded[(y + margin + 1) * pw + x + margin + 1] = small[y * ow + x]
  const grown = dilate(padded, pw, ph, margin)
  // Fill interior holes so the plate is solid.
  const holes = backgroundMaskBinary(grown, pw, ph)
  for (let i = 0; i < grown.length; i++) if (!holes[i]) grown[i] = 1
  const pts = simplify(traceOutline(grown, pw, ph), 0.7)
  const outline = pts.map(([x, y]) => [(x - margin - 1 + 0.5) / ow, (y - margin - 1 + 0.5) / oh] as [number, number])

  return { art, silhouette, outline, aspect: w / h, edge: edgeColor(data.data, data.width, main) }
}

/** Empty space connected to the border of a binary mask (everything else is the solid piece). */
function backgroundMaskBinary(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (p: number) => {
    if (!out[p] && !mask[p]) {
      out[p] = 1
      stack.push(p)
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
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p - x) / w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w)
    if (y < h - 1) push(p + w)
  }
  return out
}
