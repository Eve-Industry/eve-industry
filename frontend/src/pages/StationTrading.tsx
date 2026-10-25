import { useStationTrading } from '../api/queries'
import type { components } from '../api/schema'
import { formatIsk, formatQty } from '../components/format'
import { FreshnessBadge } from '../components/FreshnessBadge'
import { ItemCell, OpportunityTable, Signed, type Column } from '../components/OpportunityTable'
import { Pager } from '../components/Pager'
import { numberParam, ScanForm, useScanParams, type RegionId, type ScanField } from '../components/ScanForm'

type Row = components['schemas']['StationTradingOpportunityResource']

const DEFAULTS = { region_id: '10000002', broker_fee: '3', sales_tax: '3.6', min_margin: '5', min_daily_volume: '5' }

const FIELDS: ScanField[] = [
  { name: 'region_id', label: 'Region', kind: 'region' },
  { name: 'broker_fee', label: 'Broker fee %', hint: '(buy + sell)', kind: 'number', min: 0, max: 10, step: 0.1 },
  { name: 'sales_tax', label: 'Sales tax %', kind: 'number', min: 0, max: 15, step: 0.1 },
  { name: 'min_margin', label: 'Min net margin %', kind: 'number', min: 0, max: 100, step: 0.5 },
  { name: 'min_daily_volume', label: 'Min daily volume', kind: 'number', min: 0, step: 1 },
]

const pct = (n: number) => `${n.toFixed(1)}%`

const COLUMNS: Column<Row>[] = [
  { key: 'type_name', label: 'Item', render: (r) => <ItemCell row={r} /> },
  { key: 'best_buy', label: 'Best buy', numeric: true, render: (r) => formatIsk(r.best_buy) },
  { key: 'best_sell', label: 'Best sell', numeric: true, render: (r) => formatIsk(r.best_sell) },
  {
    key: 'net_profit_per_unit',
    label: 'Net profit/unit',
    numeric: true,
    render: (r) => <Signed value={r.net_profit_per_unit}>{formatIsk(r.net_profit_per_unit)}</Signed>,
  },
  { key: 'net_margin_pct', label: 'Net margin', numeric: true, render: (r) => pct(r.net_margin_pct) },
  { key: 'roi_pct', label: 'ROI', numeric: true, render: (r) => <Signed value={r.roi_pct}>{pct(r.roi_pct)}</Signed> },
  { key: 'daily_volume', label: 'Daily volume', numeric: true, render: (r) => formatQty(r.daily_volume) },
  {
    key: 'daily_isk_profit',
    label: 'Daily ISK',
    numeric: true,
    render: (r) => <Signed value={r.daily_isk_profit}>{formatIsk(r.daily_isk_profit)}</Signed>,
  },
]

export default function StationTrading() {
  const { values, page, apply, setPage } = useScanParams(DEFAULTS)
  const scan = useStationTrading({
    region_id: values.region_id as RegionId,
    broker_fee: numberParam(values.broker_fee),
    sales_tax: numberParam(values.sales_tax),
    min_margin: numberParam(values.min_margin),
    min_daily_volume: numberParam(values.min_daily_volume),
    per_page: 200,
    page,
  })

  return (
    <>
      <h1>Station trading</h1>
      <p>Items in a trade hub whose buy and sell spread still pays after broker fees and sales tax.</p>
      <div className="scan-layout">
        <ScanForm key={JSON.stringify(values)} fields={FIELDS} values={values} submitLabel="Search market" onSubmit={apply} />
        <div>
          {scan.isPending ? <p>Scanning the market…</p> : null}
          {scan.isError ? (
            <p role="alert" className="panel warn">
              {scan.error.message}
            </p>
          ) : null}
          {scan.data ? (
            <>
              <p>
                <strong>{scan.data.meta.region.region_name}</strong>{' '}
                <FreshnessBadge
                  label="Orders"
                  asOf={scan.data.meta.freshness.prices_as_of}
                  stale={scan.data.meta.freshness.stale}
                />
              </p>
              {scan.data.data.length === 0 ? (
                <p className="panel">No opportunities match your filters. Try lowering the minimum margin or volume.</p>
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
