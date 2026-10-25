import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAssetsByLocation, useRefreshAssets, type AssetScope } from '../api/queries'
import { AssetLocations } from '../components/AssetLocations'
import { formatQty } from '../components/format'
import { formatAge } from '../components/FreshnessBadge'
import { isRefreshPending, POLL_MS } from '../components/AssetRefresh'


export { isRefreshPending }

const TEXT = {
  personal: {
    title: 'Character assets',
    placeholder: 'Search items, locations, characters…',
    empty: (
      <>
        No assets found. Make sure your characters have the <code>esi-assets.read_assets.v1</code> scope.
      </>
    ),
  },
  corporate: {
    title: 'Corporation assets',
    placeholder: 'Search items, locations…',
    empty: (
      <>
        No corporation assets found. Make sure your main character has the{' '}
        <code>esi-assets.read_corporation_assets.v1</code> scope and holds the Director or CEO role.
      </>
    ),
  },
} as const

export default function Assets({ scope }: { scope: AssetScope }) {
  const text = TEXT[scope]
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const [draft, setDraft] = useState(search)
  useEffect(() => setDraft(search), [search])

  const [queuedAt, setQueuedAt] = useState<number | null>(null)
  const [polling, setPolling] = useState(false)
  const assets = useAssetsByLocation(scope, search, polling ? POLL_MS : false)
  const refresh = useRefreshAssets()

  const lastUpdated = assets.data?.meta.last_updated
  const snapshot = assets.data?.meta as { snapshot_version?: string | null; pending?: boolean; stale?: boolean; enrichment_pending?: boolean } | undefined
  useEffect(() => {
    const fresh = snapshot?.pending === false && snapshot?.stale === false && snapshot?.enrichment_pending === false
    setPolling(!(fresh && queuedAt !== null && assets.dataUpdatedAt >= queuedAt) && isRefreshPending(lastUpdated, queuedAt, Date.now()))
  }, [lastUpdated, queuedAt, assets.dataUpdatedAt, snapshot?.pending, snapshot?.stale, snapshot?.enrichment_pending])

  function submit(e: FormEvent) {
    e.preventDefault()
    const q = draft.trim()
    setParams(q === '' ? {} : { search: q })
  }

  if (assets.isPending) return <p>Loading assets…</p>
  if (assets.isError) {
    const forbidden = assets.error instanceof ApiError && assets.error.status === 403
    return (
      <>
        <h1>{text.title}</h1>
        <p role="alert" className={forbidden ? 'panel warn' : undefined}>
          {forbidden ? (
            <>
              <strong>Corporation assets unavailable:</strong> {assets.error.message}
            </>
          ) : (
            'Could not load your assets.'
          )}
        </p>
      </>
    )
  }

  const { summary, solar_systems } = assets.data.data
  return (
    <>
      <div className="page-head">
        <h1>{text.title}</h1>
        <div className="page-actions">
          <span className="muted" role="status">
            {polling
              ? 'Refresh queued, updating…'
              : lastUpdated
                ? `Updated ${formatAge(lastUpdated)}`
                : 'Never updated'}
          </span>
          <button
            type="button"
            className="button"
            disabled={refresh.isPending || polling}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: () => {
                  setQueuedAt(Date.now())
                  setPolling(true)
                },
              })
            }
          >
            Refresh
          </button>
        </div>
      </div>
      {refresh.isError ? (
        <p role="alert" className="panel warn">
          {refresh.error instanceof ApiError && refresh.error.status === 429
            ? 'Refresh was requested too often; try again in a minute.'
            : 'Could not queue a refresh.'}
        </p>
      ) : null}

      <form className="search" role="search" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="asset-search">
          Search assets
        </label>
        <input
          id="asset-search"
          type="search"
          value={draft}
          maxLength={100}
          placeholder={text.placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>

      <dl className="stats">
        {(
          [
            ['Solar systems', summary.system_count],
            ['Locations', summary.location_count],
            ['Unique types', summary.type_count],
            ['Total quantity', summary.total_quantity],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="panel">
            <dt className="muted">{label}</dt>
            <dd>{formatQty(value)}</dd>
          </div>
        ))}
      </dl>

      <AssetLocations
        solarSystems={solar_systems}
        empty={search ? `No assets found matching "${search}".` : text.empty}
        scope={scope}
        search={search}
        revision={snapshot?.snapshot_version}
      />
    </>
  )
}
