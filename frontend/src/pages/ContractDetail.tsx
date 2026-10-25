import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useContract } from '../api/queries'
import { ContractTypeBadge, formatExact, formatWhen } from '../components/contracts'
import { formatQty } from '../components/format'

export default function ContractDetail() {
  const contractId = Number(useParams().contractId)
  const contract = useContract(contractId)

  const back = (
    <p>
      <Link to="/tools/contract-browser">← Contract browser</Link>
    </p>
  )

  if (contract.isPending) return <p>Loading contract…</p>
  if (contract.isError) {
    const gone = contract.error instanceof ApiError && contract.error.status === 404
    return (
      <>
        {back}
        <p role="alert" className="panel warn">
          {gone
            ? `Contract ${contractId} is no longer listed; each hourly import replaces the contracts.`
            : contract.error.message}
        </p>
      </>
    )
  }

  const c = contract.data.data
  const fields: Array<[string, string]> = [
    ['Issued', formatWhen(c.date_issued)],
    ['Expires', formatWhen(c.date_expired)],
    ['Region ID', String(c.region_id)],
    ['Issuer ID', String(c.issuer_id)],
  ]
  const courier: Array<[string, number | null]> = [
    ['Buyout', c.buyout],
    ['Reward', c.reward],
    ['Collateral', c.collateral],
  ]
  return (
    <>
      {back}
      <div className="page-head">
        <h1>Contract {c.contract_id}</h1>
        <ContractTypeBadge type={c.type} />
      </div>
      <dl className="panel stats">
        <div>
          <dt className="muted">Title</dt>
          <dd className="small">{c.title ?? '—'}</dd>
        </div>
        <div>
          <dt className="muted">Price</dt>
          <dd className="text-profit">{formatExact(c.price)}</dd>
        </div>
        <div>
          <dt className="muted">Volume</dt>
          <dd>{c.volume > 0 ? `${formatQty(Math.round(c.volume))} m³` : '—'}</dd>
        </div>
        <div>
          <dt className="muted">Items</dt>
          <dd>{c.items.length}</dd>
        </div>
      </dl>
      <dl className="totals">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="muted small">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {courier
          .filter(([, value]) => value !== null)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="muted small">{label}</dt>
              <dd>{formatExact(value)}</dd>
            </div>
          ))}
      </dl>

      {c.items.length === 0 ? (
        <p className="panel">No items in this contract.</p>
      ) : (
        <>
          <h2 className="subhead">Contract items</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Quantity</th>
                  <th>Role</th>
                  <th>BPC</th>
                  <th className="num">ME</th>
                  <th className="num">TE</th>
                  <th className="num">Runs</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item, i) => (
                  <tr key={`${item.type_id}-${i}`}>
                    <td>{item.type_name}</td>
                    <td className="num">{formatQty(item.quantity)}</td>
                    <td>{item.is_included ? 'Offered' : 'Requested'}</td>
                    <td>{item.is_blueprint_copy ? <span className="badge badge-type">BPC</span> : '—'}</td>
                    <td className="num">{item.material_efficiency ?? '—'}</td>
                    <td className="num">{item.time_efficiency ?? '—'}</td>
                    <td className="num">{item.runs !== null ? formatQty(item.runs) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
