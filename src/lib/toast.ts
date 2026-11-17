import { createStore } from './store'

export type ToastKind = 'success' | 'error' | 'info'
export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  description?: string
}

export const toastStore = createStore<ToastItem[]>([])
let nextId = 1

function push(kind: ToastKind, message: string, description?: string, duration = 4200) {
  const id = nextId++
  toastStore.set((list) => [...list.slice(-3), { id, kind, message, description }])
  window.setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id: number) {
  toastStore.set((list) => list.filter((t) => t.id !== id))
}

export const toast = {
  success: (message: string, description?: string) => push('success', message, description),
  error: (message: string, description?: string) => push('error', message, description, 6500),
  info: (message: string, description?: string) => push('info', message, description),
}
