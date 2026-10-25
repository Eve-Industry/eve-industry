import { useAssetMaterials } from '../api/queries'
import { RefreshBar, useAssetRefresh } from '../components/AssetRefresh'
import { formatIsk, formatQty } from '../components/format'
import { typeIconUrl, iconFallback } from '../components/typeIcon'

const isk = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AssetMaterials() {
  const refresh = useAssetRefresh()
  const materials = useAssetMaterials(refresh.refetchInterval)

  if (materials.isPending) return <p>Loading materials…</p>
  if (materials.isError) {
    return (
      <>
        <h1>Materials</h1>
        <p role="alert">Could not load your materials.</p>
      </>
    )
  }

  const { groups, grand_total } = materials.data.data
  const { last_updated, corporation_assets_warning } = materials.data.meta
  return (
    <>
      <div className="page-head">
        <h1>Materials</h1>
        <RefreshBar refresh={refresh} lastUpdated={last_updated} dataUpdatedAt={materials.dataUpdatedAt} />
      </div>

      {corporation_assets_warning ? (
        <p className="panel warn" role="alert">
          <strong>Corporation assets unavailable:</strong> {corporation_assets_warning}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="panel">
          No materials found. Make sure your characters have the <code>esi-assets.read_assets.v1</code> scope.
        </p>
      ) : (
        <>
          <dl className="stats">
            <div className="panel">
              <dt className="muted">Total value</dt>
              <dd title={`${isk.format(grand_total)} ISK`}>{formatIsk(grand_total)} ISK</dd>
            </div>
            <div className="panel">
              <dt className="muted">Groups</dt>
              <dd>{formatQty(groups.length)}</dd>
            </div>
          </dl>
          {groups.map((group) => (
            <section key={group.name} className="panel material-group">
              <h2>
                {group.name} <span className="muted">{formatIsk(group.total)} ISK</span>
              </h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th className="num">Quantity</th>
                      <th className="num">Unit price</th>
                      <th className="num">Total value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.type_id}>
                        <td>
                          <span className="asset-name">
                            <img
                              src={typeIconUrl(item.type_id)}
                              alt=""
                              width={24}
                              height={24}
                              loading="lazy"
                              onError={iconFallback}
                            />
                            {item.type_name}
                          </span>
                        </td>
                        <td className="num">{formatQty(item.quantity)}</td>
                        <td className="num">
                          {item.unit_price > 0 ? isk.format(item.unit_price) : <span className="muted">no price</span>}
                        </td>
                        <td className="num">{item.unit_price > 0 ? isk.format(item.total_value) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}
