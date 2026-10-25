import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { currentSubscription, pushSupported, subscribeBrowser, subscriptionBody } from '../pwa/push'
import { api, unwrap } from './client'
import type { paths } from './schema'

export type NotificationConfig = paths['/notifications']['get']['responses'][200]['content']['application/json']['data']
export type NotificationTypeSetting = NotificationConfig['types'][number]

/** A partial change; the server merges it with the user's current settings. */
export interface NotificationChanges {
  types?: Record<string, { enabled?: boolean; lead_minutes?: number; character_ids?: number[] }>
  quiet_hours?: { start: string | null; end: string | null; timezone?: string }
}

export function useNotificationConfig() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => unwrap(await api.GET('/notifications')).data,
  })
}

export function useUpdateNotifications() {
  const client = useQueryClient()
  return useMutation({
    // The generated body type models `types` as a list (a quirk of the wildcard
    // validation rules); the API takes a map keyed by notification type.
    mutationFn: async (changes: NotificationChanges) => unwrap(await api.PUT('/notifications', { body: changes as never })).data,
    onSuccess: (config) => client.setQueryData(['notifications'], config),
  })
}

export function useEnablePush() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (vapidPublicKey: string) => {
      const subscription = await subscribeBrowser(vapidPublicKey)
      unwrap(await api.PUT('/notifications/subscription', { body: subscriptionBody(subscription) }))
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

/** Removes this browser's subscription from the server, then from the push service. */
export async function forgetThisDevice() {
  const subscription = await currentSubscription()
  if (!subscription) return
  // Scramble documents the endpoint as a query parameter; it is sent as a JSON
  // body instead so the push endpoint URL stays out of access logs.
  await api.DELETE('/notifications/subscription', { body: { endpoint: subscription.endpoint } } as never)
  await subscription.unsubscribe()
}

export function useDisablePush() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: forgetThisDevice,
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: async () => unwrap(await api.POST('/notifications/test')).data,
  })
}

/**
 * Keeps the server's copy of this device current: a browser can rotate its
 * endpoint, and the server drops subscriptions the push service reports gone.
 * Only re-registers an existing subscription; it never asks for permission.
 */
export function usePushSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !pushSupported() || Notification.permission !== 'granted') return
    void currentSubscription()
      .then((subscription) => subscription ? api.PUT('/notifications/subscription', { body: subscriptionBody(subscription) }) : undefined)
      .catch(() => { /* best effort */ })
  }, [enabled])
}
