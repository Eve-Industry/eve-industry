import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useContracts } from '../api/queries'
import { ContractTypeBadge, formatExact, formatWhen } from '../components/contracts'
import { formatQty } from '../components/format'
import { FreshnessBadge } from '../components/FreshnessBadge'
import { Pager } from '../components/Pager'

const TYPES = [
  ['', 'All types'],
  ['item_exchange', 'Item exchange'],
  ['auction', 'Auction'],
  ['courier', 'Courier'],
] as const

type ContractType = 'item_exchange' | 'auction' | 'courier'

export default function ContractBrowser() {
  const [params, setParams] = useSearchParams()
  const type = params.get('type') ?? ''
  const search = params.get('search') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [draft, setDraft] = useState({ type, search })

  const contracts = useContracts({
    type: type === '' ? undefined : (type as ContractType),
    search: search === '' ? undefined : search,
    per_page: 50,
    page,
  })

  function apply(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (draft.type !== '') next.type = draft.type
    if (draft.search.trim() !== '') next.search = draft.search.trim()
    setParams(next)
  }

  function setPage(p: number) {
    setParams({ ...Object.fromEntries(params), page: String(p) })
  }

  const stats = contracts.data?.meta.stats
  const filtered = type !== '' || search !== ''
  return (
    <>
      <div className="page-head">
        <h1>Contract browser</h1>
        {contracts.data ? (
          <FreshnessBadge
            label="Contracts"
            asOf={contracts.data.meta.freshness.prices_as_of}
            stale={contracts.data.meta.freshness.stale}
          />
        ) : null}
      </div>

      {stats ? (
        <dl className="panel stats">
          <div>
            <dt className="muted">Total contracts</dt>
            <dd>{formatQty(stats.total)}</dd>
          </div>
          <div>
            <dt className="muted">Item exchange</dt>
            <dd>{formatQty(stats.item_exchange)}</dd>
          </div>
          <div>
            <dt className="muted">Auction</dt>
            <dd>{formatQty(stats.auction)}</dd>
          </div>
          <div>
            <dt className="muted">Courier</dt>
            <dd>{formatQty(stats.courier)}</dd>
          </div>
        </dl>
      ) : null}

      <form className="filters" onSubmit={apply}>
        <label className="visually-hidden" htmlFor="contract-type">
          Type
        </label>
        <select id="contract-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="contract-search">
          Title
        </label>
        <input
          id="contract-search"
          type="search"
          placeholder="Search title…"
          maxLength={100}
          value={draft.search}
          onChange={(e) => setDraft({ ...draft, search: e.target.value })}
        />
        <button type="submit" className="button">
          Filter
        </button>
        {filtered ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              setDraft({ type: '', search: '' })
              setParams({})
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {contracts.isPending ? <p>Loading contracts…</p> : null}
      {contracts.isError ? (
        <p role="alert" className="panel warn">
          {contracts.error.message}
        </p>
      ) : null}
      {contracts.data ? (
        contracts.data.data.length === 0 ? (
          <p className="panel">
            {filtered ? 'No contracts match your filters.' : 'No contracts imported yet; the hourly import fills this page.'}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th className="num">Price</th>
                    <th className="num">Volume</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th className="num">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.data.data.map((c) => (
                    <tr key={c.contract_id}>
                      <td>
                        <Link to={`/tools/contract-browser/${c.contract_id}`}>{c.contract_id}</Link>
                      </td>
                      <td>
                        <ContractTypeBadge type={c.type} />
                      </td>
                      <td className="clip" title={c.title ?? undefined}>
                        {c.title ?? '—'}
                      </td>
                      <td className="num">{formatExact(c.price, '')}</td>
                      <td className="num">{c.volume > 0 ? formatQty(Math.round(c.volume)) : '—'}</td>
                      <td>{formatWhen(c.date_issued)}</td>
                      <td>{formatWhen(c.date_expired)}</td>
                      <td className="num">{c.items_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager pagination={contracts.data.meta.pagination} onPage={setPage} />
          </>
        )
      ) : null}
    </>
  )
}
