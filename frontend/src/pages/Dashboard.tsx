import { Link } from 'react-router-dom'
import { useDashboard } from '../api/queries'
import type { components } from '../api/schema'
import { formatAge } from '../components/FreshnessBadge'

type Character = components['schemas']['DashboardCharacterResource']
type Plan = components['schemas']['DashboardPlanResource']

function Stat({ label, value, to, href, tone }: { label: string; value: number; to?: string; href?: string; tone?: 'ok' | 'warn' }) {
  const body = (
    <>
      <dd className={tone === 'ok' && value > 0 ? 'text-profit' : tone === 'warn' && value > 0 ? 'text-warn' : undefined}>{value}</dd>
      <dt className="muted">{label}</dt>
    </>
  )
  return to ? (
    <Link className="panel stat-link" to={to}>
      {body}
    </Link>
  ) : (
    <a className="panel stat-link" href={href}>
      {body}
    </a>
  )
}

function PlanList({ title, plans, href }: { title: string; plans: Plan[]; href: string }) {
  if (plans.length === 0) return null
  return (
    <section className="panel">
      <div className="page-head">
        <h2>
          {title} ({plans.length})
        </h2>
        <a href={href}>Open planner</a>
      </div>
      <ul className="plain-list">
        {plans.map((p) => (
          <li key={p.id}>
            <span>
              {p.name}
              {p.t2_type_name ? <span className="muted"> – {p.t2_type_name}</span> : null}
            </span>
            {p.updated_at ? <span className="muted small">{formatAge(p.updated_at)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CharacterRow({ c }: { c: Character }) {
  return (
    <tr>
      <td>
        <span className="asset-name">
          <img src={c.portrait_url} alt="" width={32} height={32} loading="lazy" />
          <span>
            {c.name}
            {c.is_main ? <span className="badge badge-fresh">Main</span> : null}
            {!c.is_esi_active ? <span className="badge badge-stale">Token expired</span> : null}
          </span>
        </span>
      </td>
      <td>{c.corporation_name ?? '-'}</td>
      <td>{c.alliance_name ?? '-'}</td>
      <td>{c.location ?? '-'}</td>
      <td>{c.training ?? '-'}</td>
    </tr>
  )
}

export default function Dashboard() {
  const dashboard = useDashboard()
  if (dashboard.isPending) return <p>Loading dashboard…</p>
  if (dashboard.isError) return <p role="alert">Could not load the dashboard.</p>

  const { industry, planetary, account, characters, reaction_plans, invention_plans } = dashboard.data.data
  const expired = characters.filter((c) => !c.is_esi_active)
  const main = characters.find((c) => c.is_main)
  const piAlerts = planetary.expired_extractors + planetary.full_storage

  return (
    <>
      <h1>Dashboard</h1>

      {expired.length > 0 ? (
        <div className="panel warn" role="alert">
          <strong>ESI token expired.</strong> {expired.length === 1 ? 'This character has' : 'These characters have'} been taken off
          automated tasks. Sign in with EVE SSO again to restore access.
          <ul className="plain-list">
            {expired.map((c) => (
              <li key={c.character_id}>
                <strong>{c.name}</strong>
                <a href="/auth/eve">Re-authenticate</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="stats">
        <Stat label="In-progress jobs" value={industry.in_progress} to="/industry/jobs" />
        <Stat label="Ready for delivery" value={industry.ready_jobs} to="/industry/jobs" tone="ok" />
        <Stat label="Available slots" value={industry.available_slots} to="/industry/slots" />
        <Stat label="PI alerts" value={piAlerts} href="/planetary" tone="warn" />
      </dl>

      {piAlerts > 0 ? (
        <p className="panel warn">
          {planetary.expired_extractors > 0 ? (
            <span className="badge badge-stale">
              {planetary.expired_extractors} expired {planetary.expired_extractors === 1 ? 'extractor' : 'extractors'}
            </span>
          ) : null}
          {planetary.full_storage > 0 ? (
            <span className="badge badge-stale">
              {planetary.full_storage} full or near-full {planetary.full_storage === 1 ? 'storage' : 'storages'}
            </span>
          ) : null}{' '}
          <a href="/planetary">View PI dashboard</a>
        </p>
      ) : null}

      <div className="dash-grid">
        {main ? (
          <section className="panel">
            <h2>Main character</h2>
            <div className="char-head">
              <img src={main.portrait_url} alt="" width={96} height={96} />
              <div>
                <strong>{main.name}</strong>
                <div>{main.corporation_name ?? 'No corporation'}</div>
                {main.alliance_name ? <div className="muted">{main.alliance_name}</div> : null}
              </div>
            </div>
          </section>
        ) : null}
        <section className="panel">
          <h2>Account</h2>
          <dl className="skills small">
            <dt>Main character</dt>
            <dd>{main?.name ?? 'Not set'}</dd>
            <dt>Characters</dt>
            <dd>{characters.length}</dd>
            <dt>Joined</dt>
            <dd>{account.joined_at ? new Date(account.joined_at).toLocaleDateString() : 'N/A'}</dd>
            <dt>Last login</dt>
            <dd>{account.last_login_at ? formatAge(account.last_login_at) : 'N/A'}</dd>
          </dl>
        </section>
      </div>

      <div className="dash-grid">
        <PlanList title="Reaction plans" plans={reaction_plans} href="/calculators/reaction-planner" />
        <PlanList title="Invention plans" plans={invention_plans} href="/calculators/invention-planner" />
      </div>

      <section className="panel">
        <div className="page-head">
          <h2>Your characters ({characters.length})</h2>
          <span className="page-actions">
            <a href="/characters">Manage characters</a>
            <a href="/auth/eve">Add character</a>
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Character</th>
                <th>Corporation</th>
                <th>Alliance</th>
                <th>Location</th>
                <th>Training</th>
              </tr>
            </thead>
            <tbody>
              {characters.map((c) => (
                <CharacterRow key={c.character_id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
