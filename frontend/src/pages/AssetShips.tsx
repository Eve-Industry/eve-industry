import { useAssetShips } from '../api/queries'
import { RefreshBar, useAssetRefresh } from '../components/AssetRefresh'
import { formatQty } from '../components/format'
import { typeIconUrl, iconFallback } from '../components/typeIcon'

export default function AssetShips() {
  const refresh = useAssetRefresh()
  const ships = useAssetShips(refresh.refetchInterval)

  if (ships.isPending) return <p>Loading ships…</p>
  if (ships.isError) {
    return (
      <>
        <h1>Ships</h1>
        <p role="alert">Could not load your ships.</p>
      </>
    )
  }

  const { ship_groups, total_ships, type_count } = ships.data.data
  return (
    <>
      <div className="page-head">
        <h1>Ships</h1>
        <RefreshBar refresh={refresh} lastUpdated={ships.data.meta.last_updated} dataUpdatedAt={ships.dataUpdatedAt} />
      </div>

      {ship_groups.length === 0 ? (
        <p className="panel">
          No ships found. Make sure your characters have the <code>esi-assets.read_assets.v1</code> scope and your assets
          have been refreshed.
        </p>
      ) : (
        <>
          <dl className="stats">
            <div className="panel">
              <dt className="muted">Total ships</dt>
              <dd>{formatQty(total_ships)}</dd>
            </div>
            <div className="panel">
              <dt className="muted">Ship groups</dt>
              <dd>{formatQty(type_count)}</dd>
            </div>
          </dl>
          {ship_groups.map((group) => (
            <details key={group.group_name} className="panel ship-group">
              <summary>
                <strong>{group.group_name}</strong> <span className="badge">{group.count}</span>
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ship</th>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Character</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.ships.map((ship) => (
                      <tr key={ship.item_id}>
                        <td>
                          <span className="asset-name">
                            <img
                              src={typeIconUrl(ship.type_id)}
                              alt=""
                              width={24}
                              height={24}
                              loading="lazy"
                              onError={iconFallback}
                            />
                            {ship.type_name}
                          </span>
                        </td>
                        <td className="muted">{ship.name ?? '—'}</td>
                        <td className="small">{ship.location_name || '—'}</td>
                        <td>{ship.character_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </>
      )}
    </>
  )
}
