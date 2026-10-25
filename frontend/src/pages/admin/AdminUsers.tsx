import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage, useAdminUsers, useDeleteUser, useUserAction, type AdminUser, type UserAction, type UsersQuery } from '../../api/admin'
import { AdminError } from '../../components/AdminGuard'
import { Pager } from '../../components/Pager'
import { RoleBadge, StatusBadge } from './badges'

type Sort = NonNullable<UsersQuery['sort']>

const COLUMNS: Array<{ sort: Sort; label: string }> = [
  { sort: 'name', label: 'User' },
  { sort: 'email', label: 'Email' },
  { sort: 'is_admin', label: 'Role' },
  { sort: 'is_active', label: 'Status' },
  { sort: 'last_login_at', label: 'Last login' },
  { sort: 'created_at', label: 'Joined' },
]

function SortHeader({ column, sort, direction, onSort }: {
  column: { sort: Sort; label: string }
  sort: Sort
  direction: 'asc' | 'desc'
  onSort: (sort: Sort) => void
}) {
  const active = sort === column.sort
  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort" onClick={() => onSort(column.sort)}>
        {column.label}
        {active ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )
}

function UserRow({ user, onError }: { user: AdminUser; onError: (message: string) => void }) {
  const action = useUserAction()
  const remove = useDeleteUser()
  const locked = user.role === 'super_admin'
  const busy = action.isPending || remove.isPending

  const run = (kind: UserAction) => action.mutate({ id: user.id, action: kind }, { onError: (e) => onError(errorMessage(e, 'The change failed.')) })

  return (
    <tr>
      <td>
        <span className="asset-name">
          {user.portrait_url ? <img src={user.portrait_url} alt="" width={32} height={32} loading="lazy" /> : null}
          {user.display_name}
        </span>
      </td>
      <td>{user.email}</td>
      <td>
        <RoleBadge role={user.role} />
      </td>
      <td>
        <StatusBadge active={user.is_active} />
      </td>
      <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</td>
      <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
      <td className="row-actions">
        <Link className="button" to={`/admin/users/${user.id}/industry-jobs`} aria-label={`Industry jobs of ${user.display_name}`}>
          Jobs
        </Link>
        <button type="button" className="button" disabled={busy || locked} onClick={() => run('status')}>
          {user.is_active ? 'Deactivate' : 'Activate'}
        </button>
        <button type="button" className="button" disabled={busy || locked} onClick={() => run('admin')}>
          {user.role === 'admin' ? 'Remove admin' : 'Make admin'}
        </button>
        <button type="button" className="button" disabled={busy} aria-pressed={user.is_stock_manager_enabled} onClick={() => run('stock-manager')}>
          Stock manager: {user.is_stock_manager_enabled ? 'on' : 'off'}
        </button>
        <button type="button" className="button danger" disabled={busy || locked} onClick={() => {
          if (window.confirm(`Permanently delete ${user.display_name}, their characters and all their data? This cannot be undone.`)) {
            remove.mutate(user.id, { onError: (e) => onError(errorMessage(e, 'Could not delete the user.')) })
          }
        }}>
          Delete
        </button>
      </td>
    </tr>
  )
}

export default function AdminUsers() {
  const [params, setParams] = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)
  const search = params.get('search') ?? ''
  const sort = (params.get('sort') as Sort | null) ?? 'created_at'
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc'
  const page = Number(params.get('page') ?? 1) || 1
  const [draft, setDraft] = useState(search)

  const users = useAdminUsers({ search: search || undefined, sort, direction, page })

  function update(next: Record<string, string | undefined>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') merged.delete(key)
      else merged.set(key, value)
    }
    setParams(merged)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    update({ search: draft.trim(), page: undefined })
  }

  if (users.isPending) return <p>Loading users…</p>
  if (users.isError) return <AdminError error={users.error} what="the users" />

  const { data, meta } = users.data
  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <span className="muted">{meta.pagination.total} total</span>
      </div>
      <form className="search" role="search" onSubmit={submit}>
        <input type="search" aria-label="Search users" placeholder="Name, email or character" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="button">
          Search
        </button>
      </form>
      {message ? (
        <p role="alert" className="panel warn">
          {message}
        </p>
      ) : null}
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <SortHeader key={c.sort} column={c} sort={sort} direction={direction} onSort={(s) => update({
                  sort: s,
                  direction: s === sort && direction === 'asc' ? 'desc' : 'asc',
                  page: undefined,
                })} />
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No users found.
                </td>
              </tr>
            ) : (
              data.map((u) => <UserRow key={u.id} user={u} onError={setMessage} />)
            )}
          </tbody>
        </table>
      </div>
      <Pager pagination={meta.pagination} onPage={(p) => update({ page: String(p) })} />
    </>
  )
}
