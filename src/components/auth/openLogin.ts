import { authModal, type AuthView } from '@/lib/authModal'

/**
 * Login entry point used across the app: scroll smoothly to the top, then
 * float the LOGIN / SIGN UP books into view.
 */
export function openLogin(reason?: string, initial: AuthView | null = null) {
  const alreadyTop = window.scrollY < 8
  window.scrollTo({ top: 0, behavior: 'smooth' })
  window.setTimeout(() => authModal.open(initial, reason), alreadyTop ? 0 : 260)
}
