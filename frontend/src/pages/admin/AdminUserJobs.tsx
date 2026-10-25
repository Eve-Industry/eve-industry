import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAdminUserJobs } from '../../api/admin'
import { AdminError } from '../../components/AdminGuard'
import { formatIsk, formatQty } from '../../components/format'

function Isk({ value }: { value: number | null }) {
  return value === null ? <span className="muted">—</span> : <span className="text-profit">{formatIsk(value)} ISK</span>
}

export default function AdminUserJobs() {
  const id = Number(useParams().user)
  const [params, setParams] = useSearchParams()
  const regionParam = Number(params.get('region_id')) || undefined
  const jobs = useAdminUserJobs(id, regionParam)

  if (jobs.isPending) return <p>Loading industry jobs…</p>
  if (jobs.isError) return <AdminError error={jobs.error} what="the industry jobs" />

  const { user, regions, region_id, groups, summary, grand_total } = jobs.data.data
  const total = groups.reduce((sum, g) => sum + g.jobs.length, 0)
  return (
    <>
      <div className="page-head">
        <h1>Industry jobs</h1>
        <div className="page-actions">
          <label className="scan-field">
            <span className="small">Market prices</span>
            <select value={region_id} onChange={(e) => setParams({ region_id: e.target.value })}>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="panel">
        Viewing the active jobs of <strong>{user.display_name}</strong>. <Link to="/admin/users">Back to users</Link>
      </p>

      {total === 0 ? (
        <p className="panel muted">No active industry jobs found.</p>
      ) : (
        <>
          <dl className="stats">
            <div className="panel">
              <dt className="muted">Total active jobs</dt>
              <dd>{formatQty(total)}</dd>
            </div>
            {groups.map((g) => (
              <div key={g.activity_name} className="panel">
                <dt className="muted">{g.activity_name}</dt>
                <dd>{formatQty(g.jobs.length)}</dd>
              </div>
            ))}
          </dl>

          {summary.length > 0 ? (
            <details className="panel">
              <summary>
                <strong>Production summary</strong> <span className="badge">{summary.length} items</span>
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Total runs</th>
                      <th className="num">Expected output</th>
                      <th className="num">Est. value</th>
                      <th className="num">Jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s) => (
                      <tr key={s.item_name}>
                        <td>
                          <span className="asset-name">
                            {s.item_image_url ? <img src={s.item_image_url} alt="" width={32} height={32} loading="lazy" /> : null}
                            {s.item_name}
                          </span>
                        </td>
                        <td className="num">{formatQty(s.total_runs)}</td>
                        <td className="num">{formatQty(s.total_expected_output)}</td>
                        <td className="num">
                          <Isk value={s.estimated_value} />
                        </td>
                        <td className="num">{s.job_count}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">Total</th>
                      <td />
                      <td />
                      <td className="num">
                        <Isk value={grand_total} />
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          {groups.map((g, i) => (
            <details key={g.activity_name} className="panel" open={i === 0}>
              <summary>
                <strong>{g.activity_name}</strong> <span className="badge">{g.jobs.length}</span>
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Runs</th>
                      <th className="num">Expected output</th>
                      <th className="num">Est. value</th>
                      <th>Time remaining</th>
                      <th>Progress</th>
                      <th>Character</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.jobs.map((j) => (
                      <tr key={j.job_id}>
                        <td>
                          <span className="asset-name">
                            {j.item_image_url ? <img src={j.item_image_url} alt="" width={32} height={32} loading="lazy" /> : null}
                            {j.item_name}
                          </span>
                        </td>
                        <td className="num">{formatQty(j.runs)}</td>
                        <td className="num">{formatQty(j.expected_output)}</td>
                        <td className="num">
                          <Isk value={j.estimated_value} />
                        </td>
                        <td>
                          {j.time_remaining} {j.ready_for_delivery ? <span className="badge badge-fresh">Ready</span> : null}
                        </td>
                        <td>
                          <div className="bar bar-manufacturing" role="progressbar" aria-label={`${j.item_name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={j.progress_pct}>
                            <span style={{ width: `${j.progress_pct}%` }} />
                          </div>
                          <span className="muted small">{j.progress_pct}%</span>
                        </td>
                        <td>{j.character_name}</td>
                        <td>{j.location}</td>
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
