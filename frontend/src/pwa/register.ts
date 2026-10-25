import { registerSW } from 'virtual:pwa-register'
import { markUpdateReady } from './updateState'

const UPDATE_CHECK_MS = 60 * 60_000

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const update = registerSW({
    onNeedRefresh() { markUpdateReady(() => update(true)) },
    onRegisteredSW(_url, registration) {
      // Long-lived installed apps rarely navigate, so poll for a new build.
      if (registration) setInterval(() => { void registration.update() }, UPDATE_CHECK_MS)
    },
  })
}
