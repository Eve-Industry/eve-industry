import { useRegionArbitrage } from '../api/queries'
import type { components } from '../api/schema'
import { formatIsk, formatQty } from '../components/format'
import { FreshnessBadge } from '../components/FreshnessBadge'
import { ItemCell, OpportunityTable, Signed, type Column } from '../components/OpportunityTable'
import { Pager } from '../components/Pager'
import { numberParam, ScanForm, useScanParams, type RegionId, type ScanField } from '../components/ScanForm'

type Row = components['schemas']['ArbitrageOpportunityResource']

const DEFAULTS = {
  buy_region_id: '10000002',
  sell_region_id: '10000043',
  sales_tax: '3.6',
  transport_isk_m3: '0',
  min_margin: '5',
  min_daily_volume: '5',
}

const FIELDS: ScanField[] = [
  { name: 'buy_region_id', label: 'Buy from', hint: '(source)', kind: 'region' },
  { name: 'sell_region_id', label: 'Sell into', hint: '(destination)', kind: 'region' },
  { name: 'sales_tax', label: 'Sales tax %', kind: 'number', min: 0, max: 15, step: 0.1 },
  { name: 'transport_isk_m3', label: 'Transport cost (ISK/m³)', hint: 'optional', kind: 'number', min: 0, step: 100 },
  { name: 'min_margin', label: 'Min net margin %', kind: 'number', min: 0, max: 100, step: 0.5 },
  { name: 'min_daily_volume', label: 'Min daily volume', hint: '(destination)', kind: 'number', min: 0, step: 1 },
]

const pct = (n: number) => `${n.toFixed(1)}%`

const COLUMNS: Column<Row>[] = [
  { key: 'type_name', label: 'Item', render: (r) => <ItemCell row={r} /> },
  { key: 'buy_price', label: 'Buy price', numeric: true, render: (r) => formatIsk(r.buy_price) },
  { key: 'sell_price', label: 'Sell price', numeric: true, render: (r) => formatIsk(r.sell_price) },
  {
    key: 'net_profit_per_unit',
    label: 'Net profit/unit',
    numeric: true,
    render: (r) => <Signed value={r.net_profit_per_unit}>{formatIsk(r.net_profit_per_unit)}</Signed>,
  },
  { key: 'net_margin_pct', label: 'Net margin', numeric: true, render: (r) => pct(r.net_margin_pct) },
  { key: 'roi_pct', label: 'ROI', numeric: true, render: (r) => <Signed value={r.roi_pct}>{pct(r.roi_pct)}</Signed> },
  { key: 'volume_m3', label: 'Vol m³', numeric: true, render: (r) => (r.volume_m3 ? r.volume_m3.toFixed(2) : '—') },
  {
    key: 'cargo_value_m3',
    label: 'ISK/m³',
    numeric: true,
    render: (r) => (r.cargo_value_m3 ? formatIsk(r.cargo_value_m3) : '—'),
  },
  { key: 'daily_volume', label: 'Daily volume', numeric: true, render: (r) => formatQty(r.daily_volume) },
  {
    key: 'daily_isk_profit',
    label: 'Daily ISK',
    numeric: true,
    render: (r) => <Signed value={r.daily_isk_profit}>{formatIsk(r.daily_isk_profit)}</Signed>,
  },
]

export default function RegionArbitrage() {
  const { values, page, apply, setPage } = useScanParams(DEFAULTS)
  const sameRegion = values.buy_region_id === values.sell_region_id
  const scan = useRegionArbitrage({
    buy_region_id: values.buy_region_id as RegionId,
    sell_region_id: values.sell_region_id as RegionId,
    sales_tax: numberParam(values.sales_tax),
    transport_isk_m3: numberParam(values.transport_isk_m3),
    min_margin: numberParam(values.min_margin),
    min_daily_volume: numberParam(values.min_daily_volume),
    per_page: 200,
    page,
  })

  return (
    <>
      <h1>Region arbitrage</h1>
      <p>Buy from sell orders in one trade hub and sell into buy orders in another.</p>
      <div className="scan-layout">
        <ScanForm key={JSON.stringify(values)} fields={FIELDS} values={values} submitLabel="Scan routes" onSubmit={apply} />
        <div>
          {sameRegion ? (
            <p role="alert" className="panel warn">
              Source and destination regions must be different.
            </p>
          ) : null}
          {scan.isPending && !sameRegion ? <p>Scanning both regions…</p> : null}
          {scan.isError && !sameRegion ? (
            <p role="alert" className="panel warn">
              {scan.error.message}
            </p>
          ) : null}
          {scan.data && !sameRegion ? (
            <>
              <p>
                <strong>
                  {scan.data.meta.buy_region.region_name} → {scan.data.meta.sell_region.region_name}
                </strong>{' '}
                {Object.entries(scan.data.meta.freshness_by_region).map(([regionId, f]) => (
                  <FreshnessBadge
                    key={regionId}
                    label={regionId === String(scan.data.meta.buy_region.region_id) ? 'Buy orders' : 'Sell orders'}
                    asOf={f.prices_as_of}
                    stale={f.stale}
                  />
                ))}
              </p>
              {scan.data.data.length === 0 ? (
                <p className="panel">No arbitrage opportunities found. Try a different route or lower the minimum margin.</p>
              ) : (
                <>
                  <OpportunityTable rows={scan.data.data} columns={COLUMNS} initialSort="daily_isk_profit" />
                  <Pager pagination={scan.data.meta.pagination} onPage={setPage} />
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
