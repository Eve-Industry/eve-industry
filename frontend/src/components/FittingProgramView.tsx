import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useCreateFittingBuildProgram,
  useFittingPlan,
  useFittings,
  type FittingPlanItem,
  type FittingScope,
  type PlanOptions,
} from '../api/fittings'
import { useAssetsByLocation } from '../api/queries'
import { WriteError } from './CorpCommon'
import { formatQty } from './format'
import { LocationFilter, type FilterLocation } from './LocationFilter'

/** One "name quantity" line per item, the EVE Multibuy format. */
export function buyText(items: Array<{ name: string; missing: number }>): string {
  return items
    .filter((i) => i.missing > 0)
    .map((i) => `${i.name} ${i.missing}`)
    .join('\n')
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="button small"
      disabled={text === ''}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? 'Copied!' : label}
    </button>
  )
}

/** Stations where the scope's assets sit, for the location filter. */
function useStockLocations(scope: FittingScope): FilterLocation[] {
  const assets = useAssetsByLocation(scope === 'personal' ? 'personal' : 'corporate', '')
  return useMemo(
    () =>
      (assets.data?.data.solar_systems ?? []).flatMap((s) =>
        s.stations.map((st) => ({ location_id: st.location_id, name: st.location_name, solar_system_name: s.solar_system_name })),
      ),
    [assets.data],
  )
}

function ItemRow({ item, build, onToggle }: { item: FittingPlanItem; build: boolean; onToggle: (checked: boolean) => void }) {
  const short = item.missing > 0
  return (
    <tr className={short ? 'row-short' : undefined}>
      <td>
        {item.name} {item.kind === 'hull' ? <span className="badge">hull</span> : null}
        {item.kind === 'cargo' ? <span className="badge">cargo / drones</span> : null}
      </td>
      <td className="num">{formatQty(item.required)}</td>
      <td className="num">{formatQty(item.on_hand)}</td>
      <td className="num">{short ? formatQty(item.missing) : '—'}</td>
      <td>
        {!short ? (
          <span className="badge badge-fresh">Ready</span>
        ) : item.buildable ? (
          <label>
            <input type="checkbox" checked={build} onChange={(e) => onToggle(e.target.checked)} /> Build{' '}
            {item.blueprint_owned ? <span className="badge badge-fresh">blueprint owned</span> : <span className="badge">no blueprint</span>}
          </label>
        ) : (
          <span className="badge">Buy only</span>
        )}
      </td>
    </tr>
  )
}

/** The fitting program: how many fitted ships your stock covers, and what to build or buy. */
export function FittingProgramView({ scope }: { scope: FittingScope }) {
  const corporate = scope === 'corporate'
  const navigate = useNavigate()
  const fittings = useFittings(scope)
  const locations = useStockLocations(scope)
  const [ships, setShips] = useState<Record<number, number>>({})
  const [includeHull, setIncludeHull] = useState(true)
  const [locationIds, setLocationIds] = useState<number[]>([])
  const [skipped, setSkipped] = useState<number[]>([])
  const [programName, setProgramName] = useState('')

  const options: PlanOptions = {
    selections: Object.entries(ships)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ fitting_id: Number(id), ships: n })),
    include_hull: includeHull,
    location_ids: locationIds,
  }
  const planQuery = useFittingPlan(scope, options)
  const createProgram = useCreateFittingBuildProgram(scope)

  const list = fittings.data
  const plan = planQuery.data?.plan
  const buildable = (plan?.items ?? []).filter((i) => i.missing > 0 && i.buildable)
  const buildIds = buildable.filter((i) => !skipped.includes(i.type_id)).map((i) => i.type_id)
  const buyItems = (plan?.items ?? []).filter((i) => i.missing > 0 && !buildIds.includes(i.type_id))
  const chosenNames = (list?.fittings ?? []).filter((f) => (ships[f.id] ?? 0) > 0).map((f) => f.name)
  const defaultName = chosenNames.length > 0 ? `${chosenNames.join(', ')} backfill`.slice(0, 100) : ''

  function build() {
    createProgram.mutate(
      { ...options, name: (programName.trim() || defaultName).slice(0, 100), type_ids: buildIds },
      { onSuccess: (id) => navigate(corporate ? `/corporate/build-programs/${id}` : `/build-programs/${id}`) },
    )
  }

  return (
    <>
      <h1>{corporate ? 'Corporate fitting program' : 'Fitting program'}</h1>
      <p>
        Choose how many fitted ships you want of each fitting. The table shows what{' '}
        {corporate ? 'the corporation’s' : 'your characters’'} assets already cover and what is missing, so you can decide what to build
        and what to buy. <Link to={corporate ? '/corporate/fittings' : '/fittings'}>Manage fittings</Link>
      </p>
      {list?.fittings.length === 0 || (corporate && list && (!list.enabled || !list.canView)) ? (
        <p className="panel">
          {corporate && list && !list.enabled
            ? 'Corporate build programs are not enabled for your corporation.'
            : 'No fittings to plan with yet.'}{' '}
          <Link to={corporate ? '/corporate/fittings' : '/fittings'}>Add a fitting</Link>
        </p>
      ) : null}
      {fittings.isPending ? <p>Loading fittings…</p> : null}
      {fittings.isError ? (
        <p role="alert" className="panel warn">
          {fittings.error.message}
        </p>
      ) : null}

      {list && list.fittings.length > 0 && (!corporate || (list.enabled && list.canView)) ? (
        <>
          <section className="panel">
            <h2 className="subhead">Ships wanted</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fitting</th>
                  <th>Hull</th>
                  <th className="num">Ships</th>
                  <th className="num">Fittable now</th>
                </tr>
              </thead>
              <tbody>
                {list.fittings.map((f) => {
                  const row = plan?.fittings.find((p) => p.fitting_id === f.id)
                  return (
                    <tr key={f.id}>
                      <td>{f.name}</td>
                      <td>{f.ship_type_name}</td>
                      <td className="num">
                        <label className="visually-hidden" htmlFor={`ships-${f.id}`}>
                          Ships of {f.name}
                        </label>
                        <input
                          id={`ships-${f.id}`}
                          type="number"
                          min={0}
                          max={10000}
                          value={ships[f.id] ?? 0}
                          onChange={(e) => setShips({ ...ships, [f.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                        />
                      </td>
                      <td className="num">{row ? `${row.ships_fittable} / ${row.ships}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="page-actions">
              <label>
                <input type="checkbox" checked={includeHull} onChange={(e) => setIncludeHull(e.target.checked)} /> Count the hull
              </label>
              <LocationFilter
                label="Stock"
                hint="Only count items at these stations and structures. Nothing ticked counts everything."
                locations={locations}
                selected={locationIds}
                disabled={locations.length === 0}
                onApply={setLocationIds}
              />
            </div>
          </section>

          {options.selections.length === 0 ? <p className="panel">Enter a number of ships for at least one fitting.</p> : null}
          {planQuery.isError ? <WriteError error={planQuery.error} fallback="Could not plan these ships." /> : null}
          {planQuery.isFetching && !plan ? <p>Checking your stock…</p> : null}

          {plan && options.selections.length > 0 ? (
            <section className="panel" aria-live="polite">
              <h2 className="subhead">
                {plan.summary.complete
                  ? 'Everything is in stock'
                  : `${plan.summary.missing_types} of ${plan.summary.item_types} item types are short`}
              </h2>
              {planQuery.data?.characterName ? (
                <p className="muted small">Corporation assets read with {planQuery.data.characterName}’s token.</p>
              ) : null}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Required</th>
                    <th className="num">On hand</th>
                    <th className="num">Missing</th>
                    <th>Build or buy</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((item) => (
                    <ItemRow
                      key={item.type_id}
                      item={item}
                      build={!skipped.includes(item.type_id)}
                      onToggle={(checked) => setSkipped(checked ? skipped.filter((id) => id !== item.type_id) : [...skipped, item.type_id])}
                    />
                  ))}
                </tbody>
              </table>

              {!plan.summary.complete ? (
                <div className="form-actions">
                  <CopyButton label={`Copy buy list (${buyItems.length})`} text={buyText(buyItems)} />
                  <label className="scan-field">
                    <span className="visually-hidden">Build program name</span>
                    <input
                      type="text"
                      maxLength={100}
                      placeholder={defaultName || 'Build program name'}
                      value={programName}
                      onChange={(e) => setProgramName(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button"
                    disabled={buildIds.length === 0 || createProgram.isPending || (programName.trim() === '' && defaultName === '')}
                    onClick={build}
                  >
                    Create build program ({buildIds.length} items)
                  </button>
                </div>
              ) : null}
              <WriteError error={createProgram.error} fallback="Could not create the build program." />
            </section>
          ) : null}
        </>
      ) : null}
    </>
  )
}
