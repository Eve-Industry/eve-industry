import { useFreshness } from '../api/queries'
import { FreshnessBadge } from '../components/FreshnessBadge'

export default function MarketStatus() {
  const freshness = useFreshness()
  if (freshness.isPending) return <p>Loading market status…</p>
  if (freshness.isError) return <p role="alert">Could not load market status.</p>
  return (
    <>
      <h1>Market data</h1>
      <p>How old the data behind prices and costs is, per trade hub.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Region</th>
              <th scope="col">Orders</th>
              <th scope="col">Build costs</th>
              <th scope="col">Global prices</th>
            </tr>
          </thead>
          <tbody>
            {freshness.data.data.map((r) => (
              <tr key={r.region_id}>
                <th scope="row">{r.region_name}</th>
                <td>
                  <FreshnessBadge label="Orders" asOf={r.orders_as_of} stale={r.stale} />
                </td>
                <td>
                  <FreshnessBadge label="Costs" asOf={r.costs_as_of} stale={r.stale} />
                </td>
                <td>
                  <FreshnessBadge label="Global" asOf={r.global_as_of} stale={r.stale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
