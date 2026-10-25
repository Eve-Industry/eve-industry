import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useDeleteSponsor, useSponsors } from '../../api/admin'
import { AdminError } from '../../components/AdminGuard'

export default function AdminSponsors() {
  const sponsors = useSponsors()
  const remove = useDeleteSponsor()
  const [message, setMessage] = useState<string | null>(null)

  if (sponsors.isPending) return <p>Loading sponsors…</p>
  if (sponsors.isError) return <AdminError error={sponsors.error} what="the sponsors" />

  const list = sponsors.data.data
  return (
    <>
      <div className="page-head">
        <h1>Sponsors</h1>
        <Link className="button" to="/admin/sponsors/new">
          Add sponsor
        </Link>
      </div>
      {message ? (
        <p role="alert" className="panel warn">
          {message}
        </p>
      ) : null}
      {list.length === 0 ? (
        <p className="panel muted">
          No sponsors yet. <Link to="/admin/sponsors/new">Add one</Link>.
        </p>
      ) : (
        <div className="table-wrap panel">
          <table>
            <thead>
              <tr>
                <th>Banner</th>
                <th>Name</th>
                <th>URL</th>
                <th className="num">Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <img className="sponsor-banner" src={s.image_url} alt={s.name} loading="lazy" />
                  </td>
                  <td>{s.name}</td>
                  <td>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.url.length > 40 ? `${s.url.slice(0, 40)}…` : s.url}
                    </a>
                  </td>
                  <td className="num">{s.sort_order}</td>
                  <td>
                    <span className={`badge ${s.is_active ? 'badge-fresh' : 'badge-bad'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="row-actions">
                    <Link className="button" to={`/admin/sponsors/${s.id}`} aria-label={`Edit ${s.name}`}>
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="button danger"
                      disabled={remove.isPending}
                      aria-label={`Delete ${s.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${s.name}?`)) {
                          remove.mutate(s.id, { onError: (e) => setMessage(errorMessage(e, 'Could not delete the sponsor.')) })
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
