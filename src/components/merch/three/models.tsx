// Procedural reconstructions of merchandise, built from a processed product photo.
// Units are centimetres. Each model rests on y = 0 (or hangs above it).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ModelParams, ProcessedArt } from './process'

function useCanvasTexture(c: HTMLCanvasElement) {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }, [c])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

const rgb = (c: [number, number, number]) => new THREE.Color(`rgb(${c[0]}, ${c[1]}, ${c[2]})`)

/** Outline (normalised, y down) -> THREE.Shape in cm, centred on x, bottom at y = 0. */
function outlineShape(outline: [number, number][], width: number, height: number) {
  const shape = new THREE.Shape()
  outline.forEach(([x, y], i) => {
    const px = (x - 0.5) * width
    const py = (1 - y) * height
    if (i === 0) shape.moveTo(px, py)
    else shape.lineTo(px, py)
  })
  shape.closePath()
  return shape
}

function acrylicMaterial(thickness: number) {
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    thickness,
    roughness: 0.05,
    ior: 1.49,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    specularIntensity: 1,
  })
}

/** Printed artwork with a white ink layer behind it, as on real acrylic goods. */
function PrintLayers({ art, width, height, z = 0 }: { art: ProcessedArt; width: number; height: number; z?: number }) {
  const map = useCanvasTexture(art.art)
  const sil = useCanvasTexture(art.silhouette)
  return (
    <group position={[0, height / 2, z]}>
      <mesh castShadow position={[0, 0, 0.004]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={map} alphaTest={0.5} roughness={0.45} side={THREE.FrontSide} />
      </mesh>
      <mesh position={[0, 0, -0.004]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={sil} alphaTest={0.5} roughness={0.7} side={THREE.FrontSide} />
      </mesh>
    </group>
  )
}

function useAcrylicPlate({ art, height, thickness, hole }: { art: ProcessedArt; height: number; thickness: number; hole?: boolean }) {
  const width = height * art.aspect
  const { geometry, holeAt } = useMemo(() => {
    const shape = outlineShape(art.outline, width, height)
    let holeAt: [number, number] | null = null
    if (hole) {
      // Ring hole just inside the top of the outline, near the horizontal centre.
      const pts = shape.getPoints()
      const top = pts.reduce((a, b) => (b.y - Math.abs(b.x) * 0.35 > a.y - Math.abs(a.x) * 0.35 ? b : a), pts[0])
      const r = Math.max(0.14, height * 0.028)
      holeAt = [top.x, top.y - r * 2.1]
      const path = new THREE.Path()
      path.absarc(holeAt[0], holeAt[1], r, 0, Math.PI * 2, true)
      shape.holes.push(path)
    }
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.08,
      bevelSize: thickness * 0.08,
      bevelSegments: 2,
      curveSegments: 6,
    })
    g.translate(0, 0, -thickness / 2)
    g.computeVertexNormals()
    return { geometry: g, holeAt }
  }, [art.outline, width, height, thickness, hole])
  useEffect(() => () => geometry.dispose(), [geometry])
  const material = useMemo(() => acrylicMaterial(thickness), [thickness])
  return { mesh: <mesh geometry={geometry} material={material} castShadow receiveShadow />, width, holeAt }
}

// ---------------------------------------------------------------------------
export function AcrylicStand({ art, params }: { art: ProcessedArt; params: ModelParams }) {
  const height = params.size_cm
  const t = (params.thickness_mm ?? 3) / 10
  const plate = useAcrylicPlate({ art, height, thickness: t })
  const baseW = Math.max(plate.width * 0.62, height * 0.32)
  const baseD = Math.max(height * 0.26, 3)
  const baseGeo = useMemo(() => {
    const s = new THREE.Shape()
    const r = Math.min(baseW, baseD) * 0.2
    const x = -baseW / 2
    const y = -baseD / 2
    s.moveTo(x + r, y)
    s.lineTo(x + baseW - r, y)
    s.quadraticCurveTo(x + baseW, y, x + baseW, y + r)
    s.lineTo(x + baseW, y + baseD - r)
    s.quadraticCurveTo(x + baseW, y + baseD, x + baseW - r, y + baseD)
    s.lineTo(x + r, y + baseD)
    s.quadraticCurveTo(x, y + baseD, x, y + baseD - r)
    s.lineTo(x, y + r)
    s.quadraticCurveTo(x, y, x + r, y)
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.1, bevelSize: t * 0.1, bevelSegments: 2 })
    g.rotateX(-Math.PI / 2)
    return g
  }, [baseW, baseD, t])
  useEffect(() => () => baseGeo.dispose(), [baseGeo])
  const baseMat = useMemo(() => acrylicMaterial(t), [t])
  const sink = t * 0.6 // the plate's tab sits in the base slot
  return (
    <group>
      <mesh geometry={baseGeo} material={baseMat} castShadow receiveShadow />
      <group position={[0, t - sink + t * 0.1, 0]}>
        {plate.mesh}
        <PrintLayers art={art} width={plate.width} height={height} />
      </group>
    </group>
  )
}

export function AcrylicCharm({ art, params }: { art: ProcessedArt; params: ModelParams }) {
  const height = params.size_cm
  const t = (params.thickness_mm ?? 3) / 10
  const plate = useAcrylicPlate({ art, height, thickness: t, hole: true })
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9d9de', metalness: 1, roughness: 0.22 }), [])
  const [hx, hy] = plate.holeAt ?? [0, height]
  const jr = Math.max(0.35, height * 0.06)
  const ring = Math.max(1.1, height * 0.2)
  return (
    <group position={[0, 0.2, 0]}>
      {plate.mesh}
      <PrintLayers art={art} width={plate.width} height={height} />
      {/* jump ring through the hole, then the split key ring */}
      <mesh position={[hx, hy + jr * 0.55, 0]} rotation={[0, Math.PI / 2, 0]} material={metal} castShadow>
        <torusGeometry args={[jr, jr * 0.12, 16, 48]} />
      </mesh>
      <mesh position={[hx, hy + jr * 1.5 + ring, 0]} rotation={[0, 0.25, 0]} material={metal} castShadow>
        <torusGeometry args={[ring, ring * 0.07, 16, 72]} />
      </mesh>
    </group>
  )
}

/** Polar grid disc with a slight dome; planar UVs so the print maps straight on. */
function domeGeometry(radius: number, dome: number, rings = 24, segments = 96) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  pos.push(0, 0, dome)
  uv.push(0.5, 0.5)
  for (let r = 1; r <= rings; r++) {
    const rr = (r / rings) * radius
    const z = dome * (1 - (rr / radius) ** 2)
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2
      const x = Math.cos(a) * rr
      const y = Math.sin(a) * rr
      pos.push(x, y, z)
      uv.push(0.5 + x / (2 * radius), 0.5 + y / (2 * radius))
    }
  }
  for (let s = 0; s < segments; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segments))
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segments
    const a1 = 1 + r * segments
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments
      idx.push(a0 + s, a1 + s, a1 + s1, a0 + s, a1 + s1, a0 + s1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function Badge({ art, params }: { art: ProcessedArt; params: ModelParams }) {
  const R = params.size_cm / 2
  const depth = Math.max(0.35, R * 0.16)
  const map = useCanvasTexture(art.art)
  const face = useMemo(() => domeGeometry(R, depth * 0.35), [R, depth])
  useEffect(() => () => face.dispose(), [face])
  const rim = useMemo(() => new THREE.MeshStandardMaterial({ color: rgb(art.edge), roughness: 0.35, metalness: 0.1 }), [art.edge])
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 1, roughness: 0.3 }), [])
  const pin = useMemo(() => {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-R * 0.55, R * 0.12, -depth / 2 - 0.06),
      new THREE.Vector3(R * 0.55, R * 0.12, -depth / 2 - 0.06),
      new THREE.Vector3(R * 0.62, R * 0.05, -depth / 2 - 0.12),
    ])
    return new THREE.TubeGeometry(c, 32, 0.035, 8)
  }, [R, depth])
  useEffect(() => () => pin.dispose(), [pin])
  return (
    // Stand the badge upright, resting on its rim.
    <group position={[0, R, 0]} rotation={[-0.12, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={rim} castShadow receiveShadow>
        <cylinderGeometry args={[R, R * 0.96, depth, 96, 1, true]} />
      </mesh>
      <mesh geometry={face} position={[0, 0, depth / 2]} castShadow>
        <meshPhysicalMaterial map={map} roughness={0.25} clearcoat={0.8} clearcoatRoughness={0.15} />
      </mesh>
      <mesh position={[0, 0, -depth / 2]} rotation={[0, Math.PI, 0]} material={steel}>
        <circleGeometry args={[R * 0.96, 96]} />
      </mesh>
      <mesh geometry={pin} material={steel} />
    </group>
  )
}

export function FlatPrint({ art, params }: { art: ProcessedArt; params: ModelParams }) {
  const finish = params.finish ?? 'paper'
  const longest = params.size_cm
  const width = art.aspect >= 1 ? longest : longest * art.aspect
  const height = art.aspect >= 1 ? longest / art.aspect : longest
  const t = (params.thickness_mm ?? (finish === 'board' || finish === 'gold_board' ? 3 : finish === 'card' ? 0.6 : 0.3)) / 10
  const map = useCanvasTexture(art.art)
  const materials = useMemo(() => {
    const paper = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.9 })
    const edge =
      finish === 'gold_board'
        ? new THREE.MeshStandardMaterial({ color: '#c9a44c', metalness: 1, roughness: 0.3 })
        : finish === 'clear'
          ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, roughness: 0.1, thickness: t })
          : paper
    const front = new THREE.MeshPhysicalMaterial({
      map,
      roughness: finish === 'clear' ? 0.08 : finish === 'paper' ? 0.75 : 0.45,
      clearcoat: finish === 'clear' || finish === 'card' ? 1 : 0,
    })
    const back = finish === 'clear' ? new THREE.MeshPhysicalMaterial({ map, roughness: 0.1, transparent: true, opacity: 0.55 }) : paper
    // BoxGeometry material order: +x, -x, +y, -y, +z (front), -z (back)
    return [edge, edge, edge, edge, front, back]
  }, [map, finish, t])
  // Lean slightly back, standing on its bottom edge like a print on a shelf.
  return (
    <group position={[0, 0, 0]} rotation={[-0.08, 0, 0]}>
      <mesh position={[0, height / 2, 0]} material={materials} castShadow receiveShadow>
        <boxGeometry args={[width, height, t]} />
      </mesh>
    </group>
  )
}

export function WallScroll({ art, params }: { art: ProcessedArt; params: ModelParams }) {
  const height = params.size_cm
  const width = height * art.aspect
  const map = useCanvasTexture(art.art)
  const fabric = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, height, 48, 64)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      // gentle ripple, strongest at the free bottom half
      const sag = (0.5 - y / height) * 0.5 + 0.5
      p.setZ(i, Math.sin((x / width) * Math.PI * 3) * 0.25 * sag)
    }
    g.computeVertexNormals()
    return g
  }, [width, height])
  useEffect(() => () => fabric.dispose(), [fabric])
  const rodLen = width + 2.4
  const rodMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.4 }), [])
  const string = useMemo(() => {
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-rodLen / 2 + 0.6, 0, 0),
      new THREE.Vector3(0, width * 0.42, 0),
      new THREE.Vector3(rodLen / 2 - 0.6, 0, 0),
    )
    return new THREE.TubeGeometry(c, 48, 0.06, 6)
  }, [rodLen, width])
  useEffect(() => () => string.dispose(), [string])
  const top = height + 1.2
  return (
    <group position={[0, 1.2, 0]}>
      <mesh geometry={fabric} position={[0, height / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={map} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {[top - 1.2 + 0.2, -0.2].map((y, i) => (
        <mesh key={i} position={[0, y, 0.1]} rotation={[0, 0, Math.PI / 2]} material={rodMat} castShadow>
          <cylinderGeometry args={[0.55, 0.55, rodLen, 24]} />
        </mesh>
      ))}
      <mesh geometry={string} position={[0, top - 1.0, 0.1]} material={rodMat} />
    </group>
  )
}

export const PROCEDURAL_MODELS = {
  acrylic_stand: AcrylicStand,
  acrylic_charm: AcrylicCharm,
  badge: Badge,
  flat_print: FlatPrint,
  wall_scroll: WallScroll,
} as const
