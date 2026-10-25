import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMarketGroup, useRootMarketGroups, useTypeSearch } from '../api/queries'
import type { components } from '../api/schema'

type Group = components['schemas']['MarketGroupResource']
type MarketType = components['schemas']['MarketTypeResource']

function TypeList({ types }: { types: MarketType[] }) {
  return (
    <ul className="type-list">
      {types.map((t) => (
        <li key={t.type_id}>
          <img src={t.icon_url} alt="" width={32} height={32} loading="lazy" />
          <span>{t.name}</span>
          {t.market_group_id !== null ? (
            <Link className="small" to={`?group=${t.market_group_id}`}>
              Show group
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function GroupList({ groups }: { groups: Group[] }) {
  return (
    <ul className="group-list">
      {groups.map((g) => (
        <li key={g.market_group_id}>
          <Link to={`?group=${g.market_group_id}`}>{g.name}</Link>
          {g.child_count > 0 ? <span className="muted small"> {g.child_count} subgroups</span> : null}
        </li>
      ))}
    </ul>
  )
}

function Group({ groupId }: { groupId: number }) {
  const group = useMarketGroup(groupId)
  if (group.isPending) return <p>Loading group…</p>
  if (group.isError) {
    return (
      <p role="alert" className="panel warn">
        {group.error.message}
      </p>
    )
  }
  const g = group.data.data
  return (
    <>
      <nav aria-label="Breadcrumbs" className="crumbs">
        <Link to="?">Market</Link>
        {g.breadcrumbs.map((crumb) =>
          crumb.market_group_id === g.market_group_id ? (
            <span key={crumb.market_group_id} aria-current="page">
              {' › '}
              {crumb.name}
            </span>
          ) : (
            <span key={crumb.market_group_id}>
              {' › '}
              <Link to={`?group=${crumb.market_group_id}`}>{crumb.name}</Link>
            </span>
          ),
        )}
      </nav>
      {g.description ? <p className="muted">{g.description}</p> : null}
      {g.children.length > 0 ? <GroupList groups={g.children} /> : null}
      {g.items.length > 0 ? <TypeList types={g.items} /> : null}
      {g.children.length === 0 && g.items.length === 0 ? <p className="panel">This group is empty.</p> : null}
    </>
  )
}

export default function MarketBrowser() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const groupId = Number(params.get('group')) || null
  const [draft, setDraft] = useState(q)
  const roots = useRootMarketGroups()
  const results = useTypeSearch(q)

  function search(e: FormEvent) {
    e.preventDefault()
    setParams(draft.trim() === '' ? {} : { q: draft.trim() })
  }

  return (
    <>
      <h1>Market browser</h1>
      <p>Browse the market tree or search for an item by name.</p>
      <form className="search" role="search" onSubmit={search}>
        <label className="visually-hidden" htmlFor="market-search">
          Item name
        </label>
        <input
          id="market-search"
          type="search"
          placeholder="Search items (2+ letters)…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="button">
          Search
        </button>
        {q !== '' ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              setDraft('')
              setParams({})
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {q !== '' ? (
        q.length < 2 ? (
          <p className="panel">Type at least two letters.</p>
        ) : results.isPending ? (
          <p>Searching…</p>
        ) : results.isError ? (
          <p role="alert" className="panel warn">
            {results.error.message}
          </p>
        ) : results.data.data.length === 0 ? (
          <p className="panel">No items match “{q}”.</p>
        ) : (
          <>
            <p className="muted small">
              {results.data.data.length >= results.data.meta.limit
                ? `First ${results.data.meta.limit} matches; narrow the search to see others.`
                : `${results.data.data.length} matches.`}
            </p>
            <TypeList types={results.data.data} />
          </>
        )
      ) : groupId !== null ? (
        <Group key={groupId} groupId={groupId} />
      ) : roots.isPending ? (
        <p>Loading market groups…</p>
      ) : roots.isError ? (
        <p role="alert" className="panel warn">
          {roots.error.message}
        </p>
      ) : (
        <GroupList groups={roots.data.data} />
      )}
    </>
  )
}
