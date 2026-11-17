import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/store'

export type ThemePref = 'light' | 'dark' | 'system'
const KEY = 'bookshelf-theme'

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const themeStore = createStore<ThemePref>(readPref())
const mql = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && !!mql?.matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* storage unavailable: keep it for this session only */
  }
  themeStore.set(pref)
  apply(pref)
}

export function useTheme() {
  const pref = useStore(themeStore)
  useEffect(() => {
    apply(pref)
    if (pref !== 'system' || !mql) return
    const onChange = () => apply('system')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [pref])
  const resolved: 'light' | 'dark' = pref === 'system' ? (mql?.matches ? 'dark' : 'light') : pref
  return { pref, resolved, setTheme }
}
