import { useFreshness } from '../api/queries'
import { FreshnessBadge } from '../components/FreshnessBadge'

export default function Overview() {
  const freshness = useFreshness()
  const jita = freshness.data?.data.find((r) => r.region_name === 'The Forge')
  return (
    <>
      <h1>Overview</h1>
      <p>
        Track your industry, plan production and explore market opportunities using the tools in the navigation.
      </p>
      {freshness.isPending ? (
        <p>Loading market status…</p>
      ) : freshness.isError ? (
        <p role="alert">Could not load market status.</p>
      ) : (
        <FreshnessBadge label="Jita orders" asOf={jita?.orders_as_of} stale={jita?.stale} />
      )}
    </>
  )
}
