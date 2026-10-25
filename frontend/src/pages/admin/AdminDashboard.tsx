import { Link } from 'react-router-dom'
import { useAdminDashboard } from '../../api/admin'
import { AdminError } from '../../components/AdminGuard'
import { BarChart } from '../../components/BarChart'
import { formatQty } from '../../components/format'
import { RoleBadge, StatusBadge } from './badges'

const TILES: Array<[keyof Stats, string]> = [
  ['users', 'Total users'],
  ['characters', 'Characters'],
  ['active_users', 'Active users'],
  ['recent_logins', 'Logins (7 days)'],
  ['new_users_week', 'New users this week'],
  ['new_users_month', 'New users this month'],
  ['logged_in_24h', 'Logged in last 24 h'],
]

type Stats = {
  users: number
  characters: number
  active_users: number
  recent_logins: number
  new_users_week: number
  new_users_month: number
  logged_in_24h: number
}

export default function AdminDashboard() {
  const dashboard = useAdminDashboard()
  if (dashboard.isPending) return <p>Loading the admin dashboard…</p>
  if (dashboard.isError) return <AdminError error={dashboard.error} what="the admin dashboard" />

  const { stats, registrations, logins, recent_users } = dashboard.data.data
  return (
    <>
      <div className="page-head">
        <h1>Admin dashboard</h1>
      </div>
      <dl className="stats">
        {TILES.map(([key, label]) => (
          <div key={key} className="panel">
            <dt className="muted">{label}</dt>
            <dd>{formatQty(stats[key])}</dd>
          </div>
        ))}
      </dl>
      <div className="charts">
        <BarChart title="New registrations" series={registrations} />
        <BarChart title="Login activity" series={logins} />
      </div>
      <div className="page-head">
        <h2>Recent users</h2>
        <Link to="/admin/users">View all</Link>
      </div>
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th className="num">Characters</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {recent_users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="asset-name">
                    {u.portrait_url ? <img src={u.portrait_url} alt="" width={32} height={32} loading="lazy" /> : null}
                    {u.display_name} <RoleBadge role={u.role} />
                  </span>
                </td>
                <td>{u.email}</td>
                <td className="num">{u.character_count}</td>
                <td>
                  <StatusBadge active={u.is_active} />
                </td>
                <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
