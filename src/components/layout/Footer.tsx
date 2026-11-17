import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="mt-16 hidden border-t border-line md:block">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-8 py-8 text-sm text-muted">
        <div className="flex items-center gap-3">
          <Logo className="text-xl" />
          <span className="text-faint">·</span>
          <span>Your personal digital library</span>
        </div>
        <p className="text-faint">Light novels · Manga · Novels · Artbooks · Collectibles</p>
      </div>
    </footer>
  )
}
