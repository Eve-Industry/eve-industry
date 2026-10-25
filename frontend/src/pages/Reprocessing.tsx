import { useReprocessing } from '../api/queries'
import type { components } from '../api/schema'
import { formatIsk, formatQty } from '../components/format'
import { FreshnessBadge } from '../components/FreshnessBadge'
import { ScopeWarning } from '../components/ScopeWarning'

type Character = components['schemas']['ReprocessingCharacterResource']
type Location = components['schemas']['ReprocessingLocationResource']

const SCOPES = [{ scope: 'esi-assets.read_assets.v1', description: 'Read Character Assets' }]

function LocationTable({ location }: { location: Location }) {
  return (
    <details className="station">
      <summary>
        {location.location_name} <span className="badge">{location.items.length} items</span>
        <span className="badge badge-fresh">+{formatIsk(location.total_profit)} ISK</span>
      </summary>
      <dl className="totals small">
        <div>
          <dt className="muted">Market value</dt>
          <dd>{formatIsk(location.total_market_value)} ISK</dd>
        </div>
        <div>
          <dt className="muted">Reprocess value</dt>
          <dd className="text-profit">{formatIsk(location.total_reprocess_value)} ISK</dd>
        </div>
        <div>
          <dt className="muted">Profit</dt>
          <dd className="text-profit">+{formatIsk(location.total_profit)} ISK</dd>
        </div>
      </dl>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="num">
                Qty
              </th>
              <th scope="col" className="num">
                Market value
              </th>
              <th scope="col" className="num">
                Reprocess value
              </th>
              <th scope="col" className="num">
                Profit
              </th>
              <th scope="col" className="num">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {location.items.map((item) => (
              <tr key={item.type_id}>
                <td>
                  <span className="asset-name">
                    <img src={item.icon_url} alt="" width={24} height={24} loading="lazy" />
                    <span title={item.materials.map((m) => `${formatQty(m.quantity)} ${m.name}`).join(', ')}>
                      {item.name}
                    </span>
                  </span>
                </td>
                <td className="num">{formatQty(item.quantity)}</td>
                <td className="num">{formatIsk(item.market_value)}</td>
                <td className="num text-profit">{formatIsk(item.reprocess_value)}</td>
                <td className="num text-profit">+{formatIsk(item.profit)}</td>
                <td className="num text-profit">+{item.profit_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function CharacterCard({ c }: { c: Character }) {
  return (
    <article className="panel char">
      <header className="char-head">
        {c.portrait_url ? <img src={c.portrait_url} alt="" width={48} height={48} loading="lazy" /> : null}
        <div>
          <h2>{c.character_name}</h2>
          <div className="muted small">
            {c.corporation_name ?? 'No corporation'} · Yield {c.yield_pct}% · Reprocessing {c.skills.reprocessing} /
            Efficiency {c.skills.reprocessing_efficiency} / Scrapmetal {c.skills.scrapmetal_processing}
          </div>
        </div>
        {c.locations.length > 0 ? (
          <span className="text-profit char-profit">+{formatIsk(c.total_profit)} ISK</span>
        ) : (
          <span className="badge char-profit">No items</span>
        )}
      </header>
      {c.locations.map((loc) => (
        <LocationTable key={loc.location_id} location={loc} />
      ))}
    </article>
  )
}

export default function Reprocessing() {
  const reprocessing = useReprocessing()

  if (reprocessing.isPending) {
    return (
      <>
        <h1>Reprocessing value</h1>
        <p role="status">Analysing hangar contents… This can take a moment on first load while material data is fetched.</p>
      </>
    )
  }
  if (reprocessing.isError) {
    return (
      <>
        <h1>Reprocessing value</h1>
        <p role="alert">
          Could not analyse your hangars.{' '}
          <button type="button" className="button" onClick={() => reprocessing.refetch()}>
            Retry
          </button>
        </p>
      </>
    )
  }

  const { data, meta } = reprocessing.data
  return (
    <>
      <div className="page-head">
        <h1>Reprocessing value</h1>
        <FreshnessBadge asOf={meta.freshness.prices_as_of} stale={meta.freshness.stale} />
      </div>
      <p className="muted">Items in your hangars that are worth more reprocessed than sold, at your characters' yields.</p>
      <ScopeWarning required={SCOPES} />

      <dl className="stats">
        <div className="panel">
          <dt className="muted">Characters scanned</dt>
          <dd>{data.totals.characters}</dd>
        </div>
        <div className="panel">
          <dt className="muted">Items worth reprocessing</dt>
          <dd>{formatQty(data.totals.items)}</dd>
        </div>
        <div className="panel">
          <dt className="muted">Potential profit</dt>
          <dd className="text-profit">{formatIsk(data.totals.profit)} ISK</dd>
        </div>
      </dl>

      {data.totals.items === 0 ? (
        <p className="panel muted">
          No items found that are worth more reprocessed. Everything in your hangars sells for more as it is.
        </p>
      ) : null}
      <div className="chars">
        {data.characters.map((c) => (
          <CharacterCard key={c.character_id} c={c} />
        ))}
      </div>
    </>
  )
}
