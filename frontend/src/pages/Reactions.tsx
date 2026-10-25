import { useEffect, useState } from 'react'
import { useMe } from '../api/queries'
import type { components } from '../api/schema'
import { useCalculateReaction, useFormulaActivity, useFormulaSearch, useReactionSkills, type ReactionRequest, type ReactionResult } from '../api/reactions'
import { formatDuration, isk, profitClass, signedIsk } from '../components/calculators/format'
import {
  DEFAULT_REGION,
  NumberField,
  PRICE_REGIONS,
  SearchPicker,
  SelectField,
  Stat,
  TypeIcon,
  errorText,
  intIn,
  num,
} from '../components/calculators/kit'
import { formatQty } from '../components/format'
import { ScopeWarning } from '../components/ScopeWarning'

type FormulaHit = components['schemas']['TypeSummaryResource']

const SKILLS = [0, 1, 2, 3, 4, 5].map((n) => [String(n), String(n)] as const)

function useFormulaHits(q: string) {
  const r = useFormulaSearch(q)
  return { data: r.data?.data, isFetching: r.isFetching, isError: r.isError }
}

export default function Reactions() {
  const me = useMe()
  const [formula, setFormula] = useState<FormulaHit | null>(null)
  const activity = useFormulaActivity(formula?.type_id ?? null)
  const [runs, setRuns] = useState('1')
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [skill, setSkill] = useState('5')
  const [rig, setRig] = useState('0')
  const [te, setTe] = useState('0')
  const [region, setRegion] = useState<string>(DEFAULT_REGION)
  const [result, setResult] = useState<ReactionResult | null>(null)

  const skills = useReactionSkills(characterId)
  useEffect(() => {
    const loaded = skills.data?.data.skills
    if (loaded) setSkill(String(loaded.reactions))
  }, [skills.data])

  const calc = useCalculateReaction()
  const data = activity.data?.data
  const canCalculate = formula !== null && data !== undefined && data.materials.length > 0 && !calc.isPending

  function calculate() {
    if (!formula || !data) return
    const product = data.products[0]
    const request: ReactionRequest = {
      formula_type_id: formula.type_id,
      product_type_id: product?.type_id ?? formula.type_id,
      runs: intIn(runs, 1, 100000, 1),
      reactions_skill: intIn(skill, 0, 5, 5),
      rig_bonus: num(rig, 0),
      structure_te_bonus: num(te, 0),
      materials: data.materials.map((m) => ({ type_id: m.type_id, name: m.name ?? String(m.type_id), quantity: m.quantity })),
      base_time: data.time,
      portion_size: product?.quantity || 1,
      region_id: Number(region),
    }
    calc.mutate(request, { onSuccess: (response) => setResult(response.data) })
  }

  const characters = me.data?.data.characters ?? []

  return (
    <>
      <h1>Reactions calculator</h1>
      <ScopeWarning required={[{ scope: 'esi-skills.read_skills.v1', description: 'Read Character Skills' }]} />
      <div className="calc-layout">
        <form
          className="panel calc-form"
          aria-label="Reaction settings"
          onSubmit={(e) => {
            e.preventDefault()
            calculate()
          }}
        >
          <SearchPicker<FormulaHit>
            label="Search reaction formula"
            placeholder="Type a reaction name…"
            useResults={useFormulaHits}
            getKey={(f) => f.type_id}
            renderItem={(f) => (
              <>
                <img src={f.icon_url} alt="" width={24} height={24} onError={(e) => (e.currentTarget.hidden = true)} />
                {f.name}
              </>
            )}
            onSelect={setFormula}
          />
          {formula ? (
            <div className="calc-picked" aria-live="polite">
              <TypeIcon typeId={data?.products[0]?.type_id ?? formula.type_id} size={32} />
              <div>
                <strong>{formula.name}</strong>
                <small className="muted">Type ID: {formula.type_id}</small>
              </div>
            </div>
          ) : null}
          {formula && activity.isPending ? <p className="muted">Loading reaction data…</p> : null}
          {formula && activity.isError ? (
            <p role="alert" className="text-warn">
              No SDE data found for this reaction. Run <code>php artisan sde:import-blueprints</code> to import blueprint data.
            </p>
          ) : null}
          {data && data.materials.length > 0 ? (
            <details open>
              <summary>Reaction inputs (per run)</summary>
              <ul className="calc-queue">
                {data.materials.map((m) => (
                  <li key={m.type_id}>
                    <TypeIcon typeId={m.type_id} />
                    <span className="pick">{m.name}</span>
                    <strong>×{formatQty(m.quantity)}</strong>
                  </li>
                ))}
              </ul>
              {data.time > 0 ? (
                <p className="calc-note">
                  Base time: {formatDuration(data.time)}
                  {(data.products[0]?.quantity ?? 1) > 1 ? ` · Output: ${data.products[0]?.quantity} per run` : ''}
                </p>
              ) : null}
            </details>
          ) : null}

          <NumberField label="Number of runs" value={runs} onChange={setRuns} min={1} max={100000} step={1} />

          <h3>Character skills</h3>
          <div className="scan-field">
            <label htmlFor="react-character">Load from character</label>
            <select
              id="react-character"
              value={characterId ?? ''}
              onChange={(e) => setCharacterId(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Manual entry</option>
              {characters.map((c) => (
                <option key={c.character_id} value={c.character_id}>
                  {c.name}
                </option>
              ))}
            </select>
            {skills.isFetching ? <span className="muted">Loading skills…</span> : null}
            {skills.isError ? <span className="text-loss">Failed to load skills</span> : null}
          </div>
          <SelectField label="Reactions" value={skill} onChange={setSkill} options={SKILLS} />

          <h3>Structure bonuses</h3>
          <NumberField label="Material rig bonus (%)" value={rig} onChange={setRig} min={0} max={10} step={0.1} />
          <NumberField label="TE rig bonus (%)" value={te} onChange={setTe} min={0} max={30} step={0.1} />
          <SelectField label="Market prices" value={region} onChange={setRegion} options={PRICE_REGIONS} />

          <button type="submit" className="button" disabled={!canCalculate}>
            {calc.isPending ? 'Calculating…' : 'Calculate'}
          </button>
          {calc.isError ? (
            <p role="alert" className="text-loss">
              {errorText(calc.error)}
            </p>
          ) : null}
        </form>

        <div className="calc-results-pane" aria-busy={calc.isPending}>
          {result ? <ReactionResults result={result} /> : <p className="panel muted">Search for a reaction formula to see calculations.</p>}
        </div>
      </div>
    </>
  )
}

export function ReactionResults({ result }: { result: ReactionResult }) {
  const s = result.summary
  return (
    <>
      <section className="panel" aria-labelledby="rtime-heading">
        <h2 id="rtime-heading">Reaction time</h2>
        <dl className="calc-stats">
          <Stat label="Per run">{formatDuration(result.time.time_per_run_seconds)}</Stat>
          <Stat label="Total">{formatDuration(result.time.total_time_seconds)}</Stat>
          <Stat label="Base time">{formatDuration(result.time.base_time_seconds)}</Stat>
        </dl>
      </section>
      <section className="panel" aria-labelledby="rprofit-heading">
        <h2 id="rprofit-heading">Cost &amp; profit</h2>
        <dl className="calc-stats">
          <Stat label="Material cost">{isk(s.material_cost)}</Stat>
          <Stat label={`Revenue (${formatQty(result.product.total_output)} units)`}>{isk(result.product.total_revenue)}</Stat>
          <Stat label="SCC fee (4%)" className="text-warn">
            {isk(s.scc_fee)}
          </Stat>
          <Stat label="Profit" className={profitClass(s.profit)}>
            {signedIsk(s.profit)}
          </Stat>
          <Stat label="Margin" className={profitClass(s.profit)}>
            {s.profit_margin}%
          </Stat>
          <Stat label="Sell price (unit)">{isk(result.product.sell_price)}</Stat>
          <Stat label="Profit/unit" className={profitClass(s.profit)}>
            {signedIsk(s.profit_per_unit)}
          </Stat>
        </dl>
      </section>
      <section className="panel" aria-labelledby="rmat-heading">
        <h2 id="rmat-heading">Input materials</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col" className="num">
                  Base qty
                </th>
                <th scope="col" className="num">
                  Adjusted qty
                </th>
                <th scope="col" className="num">
                  Unit price
                </th>
                <th scope="col" className="num">
                  Total cost
                </th>
              </tr>
            </thead>
            <tbody>
              {result.materials.map((m) => (
                <tr key={m.type_id}>
                  <td>
                    <span className="asset-name">
                      <TypeIcon typeId={m.type_id} />
                      {m.name}
                    </span>
                  </td>
                  <td className="num">{formatQty(m.base_quantity)}</td>
                  <td className="num">{formatQty(m.adjusted_quantity)}</td>
                  <td className="num">{isk(m.unit_price)}</td>
                  <td className="num">{isk(m.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
