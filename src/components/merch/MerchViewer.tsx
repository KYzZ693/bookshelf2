// Interactive 3D preview for merchandise. Lazy-loaded: three.js is only downloaded when a
// merchandise preview is opened.
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, ContactShadows, Environment, Html, Lightformer, OrbitControls, useBounds, useGLTF } from '@react-three/drei'
import { Loader2, Maximize2, Minimize2, RotateCcw, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MerchandiseDetail } from '@/types/db'
import { isModelParams, processArt, type ModelParams, type ProcessedArt } from './three/process'
import { PROCEDURAL_MODELS } from './three/models'

type Status = { state: 'loading' } | { state: 'ready'; art: ProcessedArt | null } | { state: 'error'; message: string }

export default function MerchViewer({ item, onUnavailable }: { item: MerchandiseDetail; onUnavailable: (reason: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const resetRef = useRef<() => void>(() => {})
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [full, setFull] = useState(false)
  const [spin, setSpin] = useState(true)

  const params = isModelParams(item.model_params) ? item.model_params : null
  const isFile = (item.model_format === 'glb' || item.model_format === 'gltf') && !!item.model_url

  // Procedural models: process the product photo once, outside the render loop.
  useEffect(() => {
    let alive = true
    if (isFile) {
      setStatus({ state: 'ready', art: null })
      return
    }
    if (!params || !item.image_url) {
      setStatus({ state: 'error', message: 'No 3D data for this item.' })
      return
    }
    setStatus({ state: 'loading' })
    processArt(item.image_url, params)
      .then((art) => alive && setStatus({ state: 'ready', art }))
      .catch((e: Error) => alive && setStatus({ state: 'error', message: e.message }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.image_url, item.model_url, isFile])

  useEffect(() => {
    if (status.state === 'error') onUnavailable(status.message)
  }, [status, onUnavailable])

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else container.current?.requestFullscreen?.()
  }

  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled

  return (
    <div
      ref={container}
      className={cn(
        'relative overflow-hidden bg-gradient-to-b from-[#f3f1ec] to-[#e4e0d6] dark:from-[#2a2823] dark:to-[#1a1916]',
        full ? 'h-full w-full' : 'aspect-square w-full rounded-2xl border border-line',
      )}
    >
      {status.state === 'ready' && (
        <ViewerErrorBoundary onError={(m) => onUnavailable(m)}>
          <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 6, 42], fov: 32, near: 0.1, far: 2000 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.55} />
            <directionalLight position={[14, 26, 18]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
            <Environment resolution={256}>
              <Lightformer form="rect" intensity={2.5} position={[0, 6, -10]} scale={[14, 8, 1]} />
              <Lightformer form="rect" intensity={1.6} position={[-10, 3, 6]} rotation-y={Math.PI / 2} scale={[10, 6, 1]} />
              <Lightformer form="rect" intensity={1.6} position={[10, 3, 6]} rotation-y={-Math.PI / 2} scale={[10, 6, 1]} />
              <Lightformer form="circle" intensity={1.2} position={[0, 12, 4]} rotation-x={Math.PI / 2} scale={6} />
            </Environment>
            <Suspense
              fallback={
                <Html center>
                  <Loader2 className="size-6 animate-spin text-muted" />
                </Html>
              }
            >
              <Bounds fit clip observe margin={1.25}>
                <Center top>
                  {isFile ? <FileModel url={item.model_url!} /> : <ProceduralModel art={status.art!} params={params!} />}
                </Center>
                <BoundsReset resetRef={resetRef} />
              </Bounds>
              <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={80} blur={2.4} far={40} resolution={512} />
            </Suspense>
            <OrbitControls makeDefault enableDamping autoRotate={spin} autoRotateSpeed={0.9} minPolarAngle={0.15} maxPolarAngle={Math.PI / 1.9} />
          </Canvas>
        </ViewerErrorBoundary>
      )}

      {status.state === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 text-sm text-muted">
            <Loader2 className="size-6 animate-spin" />
            Building the 3D preview…
          </div>
        </div>
      )}

      {status.state === 'ready' && (
        <div className="absolute right-3 bottom-3 flex gap-1.5">
          <ToolButton label={spin ? 'Stop turning' : 'Turn automatically'} onClick={() => setSpin((s) => !s)}>
            <RotateCw className={cn('size-4', spin && 'text-accent')} />
          </ToolButton>
          <ToolButton label="Reset view" onClick={() => { setSpin(false); resetRef.current() }}>
            <RotateCcw className="size-4" />
          </ToolButton>
          {canFullscreen && (
            <ToolButton label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>
              {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </ToolButton>
          )}
        </div>
      )}
      {status.state === 'ready' && (
        <p className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/45 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
          Drag to rotate · scroll or pinch to zoom
        </p>
      )}
    </div>
  )
}

function ProceduralModel({ art, params }: { art: ProcessedArt; params: ModelParams }) {
  const Model = PROCEDURAL_MODELS[params.method]
  if (!Model) throw new Error(`Unknown model type "${params.method}".`)
  return <Model art={art} params={params} />
}

function FileModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  useEffect(() => {
    scene.traverse((o) => {
      o.castShadow = true
      o.receiveShadow = true
    })
  }, [scene])
  return <primitive object={scene} />
}

function BoundsReset({ resetRef }: { resetRef: React.RefObject<() => void> }) {
  const api = useBounds()
  useEffect(() => {
    resetRef.current = () => api.refresh().clip().fit()
  }, [api, resetRef])
  return null
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-full bg-surface/90 text-ink shadow-card backdrop-blur-sm transition-colors hover:text-accent"
    >
      {children}
    </button>
  )
}

class ViewerErrorBoundary extends Component<{ onError: (m: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'The 3D model could not be displayed.')
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
