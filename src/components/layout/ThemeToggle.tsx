import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePref } from '@/hooks/useTheme'

const NEXT: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'system', system: 'light' }
const LABEL: Record<ThemePref, string> = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' }

export function ThemeToggle() {
  const { pref, setTheme } = useTheme()
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor
  return (
    <button
      onClick={() => setTheme(NEXT[pref])}
      className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      aria-label={`${LABEL[pref]} (click to switch)`}
      title={LABEL[pref]}
    >
      <Icon className="size-[18px]" />
    </button>
  )
}
