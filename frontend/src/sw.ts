/// <reference lib="webworker" />
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Only the app shell and hashed build assets are precached. API, Sanctum and
// login traffic is never routed through here (it is outside the /app/ scope or
// not a navigation), so no authenticated data is ever stored by the worker.
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Navigations go to the network so Laravel's auth redirect still applies. Only
// when the network is unreachable do we serve the precached shell, which then
// renders from the persisted query cache.
registerRoute(
  new NavigationRoute(async ({ request }) => {
    try {
      return await fetch(request)
    } catch {
      return (await matchPrecache('index.html')) ?? Response.error()
    }
  }),
)

interface PushPayload { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  try { payload = event.data?.json() ?? {} } catch { /* show the default text */ }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Eve Industrialist', {
      body: payload.body,
      tag: payload.tag,
      icon: '/app/icon-192.png',
      badge: '/app/icon-192.png',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only ever open pages of this app, whatever a payload says.
  const requested = String(event.notification.data?.url ?? '')
  const url = requested.startsWith('/app/') ? requested : '/app/dashboard'

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((client) => new URL(client.url).pathname.startsWith('/app/'))
    if (open) {
      await open.focus()
      await open.navigate(url)
    } else {
      await self.clients.openWindow(url)
    }
  })())
})

// The page asks for activation once the user accepts the update prompt.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
