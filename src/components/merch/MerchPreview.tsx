import { lazy, Suspense, useCallback, useState } from 'react'
import { Box, Image as ImageIcon, Info, Loader2, ZoomIn, ZoomOut } from 'lucide-react'
import { CoverImage } from '@/components/CoverImage'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { MERCH_ASPECT, MERCH_LABEL } from '@/lib/labels'
import type { MerchandiseDetail } from '@/types/db'

// three.js + React Three Fiber are only downloaded when a preview is actually shown.
const MerchViewer = lazy(() => import('./MerchViewer'))

/**
 * Merchandise media: an interactive 3D preview when one is available (official model or a
 * simulated reconstruction), otherwise — or on request — the product photo gallery.
 */
export function MerchPreview({ item }: { item: MerchandiseDetail }) {
  const has3d = item.preview_available
  const [tab, setTab] = useState<'3d' | 'photos'>(has3d ? '3d' : 'photos')
  const [failure, setFailure] = useState<string | null>(null)
  const onUnavailable = useCallback((reason: string) => {
    setFailure(reason)
    setTab('photos')
  }, [])
  const show3d = has3d && !failure

  return (
    <div>
      {show3d && (
        <div role="tablist" aria-label="Preview" className="mb-3 inline-flex rounded-xl border border-line bg-surface p-1">
          <TabButton active={tab === '3d'} onClick={() => setTab('3d')} icon={<Box className="size-4" />}>
            3D preview
          </TabButton>
          <TabButton active={tab === 'photos'} onClick={() => setTab('photos')} icon={<ImageIcon className="size-4" />}>
            Photos
          </TabButton>
        </div>
      )}

      {tab === '3d' && show3d ? (
        <Suspense
          fallback={
            <div className="grid aspect-square w-full place-items-center rounded-2xl border border-line bg-surface-2">
              <Loader2 className="size-6 animate-spin text-muted" />
            </div>
          }
        >
          <MerchViewer item={item} onUnavailable={onUnavailable} />
        </Suspense>
      ) : (
        <Gallery item={item} />
      )}

      {!show3d && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            3D preview unavailable for this item
            {failure ? ` — ${failure}` : item.reconstruction_notes ? ` — ${item.reconstruction_notes}` : '.'} Inspect the product photos instead.
          </span>
        </p>
      )}
    </div>
  )
}

function Gallery({ item }: { item: MerchandiseDetail }) {
  const images = [item.image_url, ...item.reference_urls.filter((u) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(u))].filter(
    (u, i, a): u is string => !!u && a.indexOf(u) === i,
  )
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const current = images[active] ?? null

  return (
    <div>
      <button
        type="button"
        onClick={() => current && setOpen(true)}
        disabled={!current}
        className="group relative block w-full overflow-hidden rounded-2xl border border-line bg-surface p-3 text-left"
        aria-label="Open the photo at full size"
      >
        <div className="overflow-hidden rounded-xl bg-[#f6f4f0] dark:bg-[#26241f]">
          <CoverImage
            src={current}
            title={item.title}
            subtitle={MERCH_LABEL[item.merch_type]}
            category="merchandise"
            plain
            fit="contain"
            eager
            aspect={item.merch_type === 'poster' || item.merch_type === 'tapestry' ? 'aspect-[4/5]' : 'aspect-square'}
            rounded="rounded-xl"
            sizes="(min-width: 1024px) 620px, 100vw"
          />
        </div>
        {current && (
          <span className="absolute right-5 bottom-5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn className="size-3.5" /> Inspect
          </span>
        )}
      </button>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              onClick={() => setActive(i)}
              className={cn('w-16 shrink-0 rounded-lg border-2 p-0.5', i === active ? 'border-merch' : 'border-transparent hover:border-line')}
              aria-label={`Photo ${i + 1}`}
            >
              <CoverImage src={src} title={item.title} category="merchandise" plain fit="contain" aspect={MERCH_ASPECT[item.merch_type]} rounded="rounded-md" sizes="64px" />
            </button>
          ))}
        </div>
      )}

      {current && <Lightbox open={open} onClose={() => setOpen(false)} src={current} alt={item.title} />}
    </div>
  )
}

/** Full-size photo; click to zoom 2.5×, move the pointer to pan. */
function Lightbox({ open, onClose, src, alt }: { open: boolean; onClose: () => void; src: string; alt: string }) {
  const [zoom, setZoom] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  return (
    <Modal open={open} onClose={() => { setZoom(false); onClose() }} title={alt} size="xl">
      <div
        className={cn('relative overflow-hidden rounded-xl bg-[#f6f4f0] dark:bg-[#26241f]', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
        onClick={() => setZoom((z) => !z)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`)
        }}
      >
        <img
          src={src}
          alt={alt}
          className="mx-auto max-h-[75vh] w-auto object-contain transition-transform duration-200"
          style={{ transform: zoom ? 'scale(2.5)' : 'none', transformOrigin: origin }}
        />
        <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
          {zoom ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />} {zoom ? 'Click to zoom out' : 'Click to zoom in'}
        </span>
      </div>
    </Modal>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors',
        active ? 'bg-merch text-white shadow-sm' : 'text-muted hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
