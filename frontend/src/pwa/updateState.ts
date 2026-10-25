import { useSyncExternalStore } from 'react'

// Bridges the service worker registration (main.tsx) and the UI. Kept free of
// the virtual:pwa-register import so components stay testable under jsdom.
let applyWorkerUpdate: (() => Promise<void>) | null = null
let updateReady = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function markUpdateReady(apply: () => Promise<void>) {
  applyWorkerUpdate = apply
  updateReady = true
  listeners.forEach((listener) => listener())
}

export function useUpdateReady() {
  return useSyncExternalStore(subscribe, () => updateReady)
}

export function applyUpdate() {
  void applyWorkerUpdate?.()
}

export function resetUpdateState() {
  applyWorkerUpdate = null
  updateReady = false
  listeners.forEach((listener) => listener())
}
