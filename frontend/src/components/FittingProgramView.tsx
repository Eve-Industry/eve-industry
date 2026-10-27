import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  useCreateFittingBuildProgram,
  useFittingPlan,
  useFittings,
  type ExistingShip,
  type FittingPlan,
  type FittingPlanItem,
  type FittingScope,
  type PlanOptions,
} from '../api/fittings'
import { useAssetsByLocation } from '../api/queries'
import { BetaBadge } from './BetaBadge'
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

/** The fitted and partly fitted ships you already own for one fitting, with what each still lacks. */
function ExistingShips({ fitting }: { fitting: FittingPlan['fittings'][number] }) {
  return (
    <section className="panel" aria-label={`Existing ${fitting.name} ships`}>
      <h2 className="subhead">
        {fitting.name} ships you already have{' '}
        <span className="muted small">
          {fitting.ships_fitted} of {fitting.ships} wanted already fitted
        </span>
      </h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Ship</th>
            <th>Location</th>
            <th>Fit</th>
            <th>Status</th>
            <th>
              <span className="visually-hidden">Contents</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fitting.existing_ships.map((ship) => (
            <ShipRow key={ship.item_id} ship={ship} hullName={fitting.ship_type_name} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Slot flag prefix → heading, in the order the fitting window shows them. */
const SLOT_GROUPS: Array<[prefix: string, title: string]> = [
  ['HiSlot', 'High slots'],
  ['MedSlot', 'Mid slots'],
  ['LoSlot', 'Low slots'],
  ['RigSlot', 'Rig slots'],
  ['SubSystemSlot', 'Subsystems'],
]

export interface ContentLine {
  key: string
  /** `Slot 3` for a fitted item, empty for the lines of a hold. */
  slot: string
  name: string
  quantity: number
}

/** "DroneBay" → "Drone bay". */
function holdName(flag: string): string {
  const words = flag.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Split what is inside a ship into the fitted slots, the cargo hold (kept on
 * its own) and every other hold (drone bay, fighter bay and so on).
 */
export function groupShipContents(contents: ExistingShip['contents']): {
  slots: Array<{ title: string; lines: ContentLine[] }>
  cargo: ContentLine[]
  holds: Array<{ title: string; lines: ContentLine[] }>
} {
  const line = (item: ExistingShip['contents'][number], index: number, slot = ''): ContentLine => ({
    key: `${item.flag}-${item.type_id}-${index}`,
    slot,
    name: item.name,
    quantity: item.quantity,
  })
  const byName = (a: ContentLine, b: ContentLine) => a.name.localeCompare(b.name)

  /** 1-based slot number of `HiSlot0`-style flags, or null for anything else. */
  const slotNumber = (flag: string, prefix: string): number | null => {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(flag)
    return match ? Number(match[1]) + 1 : null
  }
  const isSlot = (flag: string) => SLOT_GROUPS.some(([prefix]) => slotNumber(flag, prefix) !== null)

  const slots = SLOT_GROUPS.map(([prefix, title]) => ({
    title,
    lines: contents
      .filter((item) => slotNumber(item.flag, prefix) !== null)
      .map((item, i) => line(item, i, `Slot ${slotNumber(item.flag, prefix)}`)),
  })).filter((group) => group.lines.length > 0)

  const cargo = contents.filter((item) => item.flag === 'Cargo').map((item, i) => line(item, i)).sort(byName)

  const otherFlags = [...new Set(contents.map((item) => item.flag))]
    .filter((flag) => flag !== 'Cargo' && !isSlot(flag))
    .sort()
  const holds = otherFlags.map((flag) => ({
    title: flag === '' ? 'Other' : holdName(flag),
    lines: contents.filter((item) => item.flag === flag).map((item, i) => line(item, i)).sort(byName),
  }))

  return { slots, cargo, holds }
}

function ContentList({ title, lines }: { title: string; lines: ContentLine[] }) {
  return (
    <div>
      <h3 className="ship-contents-title">{title}</h3>
      <ul className="ship-contents-list small">
        {lines.map((l) => (
          <li key={l.key}>
            {l.slot ? <span className="muted">{l.slot} · </span> : null}
            {l.quantity > 1 ? `${formatQty(l.quantity)} × ` : ''}
            {l.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One ship you already have, with a row underneath showing what is inside it. */
function ShipRow({ ship, hullName }: { ship: ExistingShip; hullName: string }) {
  const [open, setOpen] = useState(false)
  const label = ship.name ?? hullName
  const { slots, cargo, holds } = groupShipContents(ship.contents)
  const empty = slots.length === 0 && cargo.length === 0 && holds.length === 0

  return (
    <>
      <tr>
        <td>{label}</td>
        <td>{ship.location_name ?? 'Unknown location'}</td>
        <td className="num">
          {ship.fitted_count}/{ship.total_count}
        </td>
        <td>
          {ship.status === 'fitted' ? (
            ship.counted ? (
              <span className="badge badge-fresh">Fitted · counted</span>
            ) : (
              <span className="badge">Fitted · not needed</span>
            )
          ) : (
            <details>
              <summary>
                <span className="badge">Partly fitted</span>
              </summary>
              <ul className="small">
                {ship.missing.map((m) => (
                  <li key={m.type_id}>
                    Needs {formatQty(m.quantity)} × {m.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </td>
        <td className="ship-toggle-cell">
          <button
            type="button"
            className="button small ship-toggle"
            aria-expanded={open}
            aria-label={`${open ? 'Hide' : 'Show'} contents of ${label}`}
            onClick={() => setOpen(!open)}
          >
            {open ? '▾' : '▸'}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="ship-contents">
          <td colSpan={5}>
            {empty ? (
              <p className="muted small">Nothing inside this ship.</p>
            ) : (
              <div className="ship-contents-grid">
                {slots.length > 0 ? (
                  <div className="ship-contents-fitted">
                    <h3 className="ship-contents-heading">Fitted</h3>
                    <div className="ship-contents-columns">
                      {slots.map((g) => (
                        <ContentList key={g.title} title={g.title} lines={g.lines} />
                      ))}
                    </div>
                  </div>
                ) : null}
                {cargo.length > 0 ? (
                  <div className="ship-contents-cargo">
                    <h3 className="ship-contents-heading">Cargo</h3>
                    <ContentList title="Cargo hold" lines={cargo} />
                  </div>
                ) : null}
                {holds.length > 0 ? (
                  <div className="ship-contents-holds">
                    <h3 className="ship-contents-heading">Other holds</h3>
                    {holds.map((g) => (
                      <ContentList key={g.title} title={g.title} lines={g.lines} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
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
  const [countFitted, setCountFitted] = useState(true)
  const [locationIds, setLocationIds] = useState<number[]>([])
  const [skipped, setSkipped] = useState<number[]>([])
  const [programName, setProgramName] = useState('')

  const options: PlanOptions = {
    selections: Object.entries(ships)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ fitting_id: Number(id), ships: n })),
    include_hull: includeHull,
    count_fitted_ships: countFitted,
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
      <h1>{corporate ? 'Corporate fitting program' : 'Fitting program'}<BetaBadge /></h1>
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
        <div className="fitting-stack">
          <section className="panel">
            <h2 className="subhead">Ships wanted</h2>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fitting</th>
                  <th>Hull</th>
                  <th className="num">Ships</th>
                  <th className="num">Already fitted</th>
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
                      <td className="num">{row ? row.ships_fitted : '—'}</td>
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
              <label>
                <input type="checkbox" checked={countFitted} onChange={(e) => setCountFitted(e.target.checked)} /> Count ships already
                fitted
              </label>              <LocationFilter
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

          {plan && options.selections.length > 0
            ? plan.fittings
                .filter((f) => f.existing_ships.length > 0)
                .map((f) => <ExistingShips key={f.fitting_id} fitting={f} />)
            : null}

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
        </div>
      ) : null}
    </>
  )
}
