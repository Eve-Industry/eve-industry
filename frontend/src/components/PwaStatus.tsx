import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { applyUpdate, useUpdateReady } from '../pwa/updateState'

function useOnline() {
  return useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline())
}

export function PwaStatus() {
  const online = useOnline()
  const updateReady = useUpdateReady()
  if (online && !updateReady) return null

  return (
    <div className="pwa-status" role="status">
      {!online ? <span>You're offline. Showing the last data loaded; changes will refresh when the connection returns.</span> : null}
      {updateReady ? (
        <span>
          A new version is available.{' '}
          <button type="button" className="button small" onClick={applyUpdate}>Reload to update</button>
        </span>
      ) : null}
    </div>
  )
}
