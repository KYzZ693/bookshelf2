import { createStore } from './store'

export type AuthView = 'login' | 'signup'

interface AuthModalState {
  open: boolean
  /** Pre-selected book; null lets the user pick between LOGIN and SIGN UP. */
  initial: AuthView | null
  /** Optional reason shown above the books ("Sign in to save to your wishlist"). */
  reason?: string
}

export const authModalStore = createStore<AuthModalState>({ open: false, initial: null })

export const authModal = {
  open(initial: AuthView | null = null, reason?: string) {
    authModalStore.set({ open: true, initial, reason })
  },
  close() {
    authModalStore.set((s) => ({ ...s, open: false }))
  },
}
