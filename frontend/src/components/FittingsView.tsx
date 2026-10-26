import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  useDeleteFitting,
  useFittings,
  useParseFitting,
  useSaveFitting,
  type Fitting,
  type FittingScope,
} from '../api/fittings'
import { WriteError } from './CorpCommon'
import { formatQty } from './format'

const PLACEHOLDER = '[Typhoon, My fit]\n1600mm Steel Plates II\nDamage Control II\n…\n\nScourge Fury Heavy Missile x802'

function FittingForm({ scope }: { scope: FittingScope }) {
  const [eft, setEft] = useState('')
  const [name, setName] = useState('')
  const [ignoreUnmatched, setIgnoreUnmatched] = useState(false)
  const parse = useParseFitting()
  const save = useSaveFitting(scope)
  const preview = parse.data
  const unmatched = preview?.unmatched ?? []

  function reset() {
    setEft('')
    setName('')
    setIgnoreUnmatched(false)
    parse.reset()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (eft.trim() === '') return
    save.mutate(
      { eft, name: name.trim() === '' ? undefined : name.trim(), ignore_unmatched: ignoreUnmatched },
      { onSuccess: reset },
    )
  }

  return (
    <form className="panel scan-form" onSubmit={submit}>
      <h2 className="subhead">Add fitting</h2>
      <div className="scan-field">
        <label htmlFor="fitting-eft">Fitting (EFT format)</label>
        <textarea
          id="fitting-eft"
          rows={12}
          placeholder={PLACEHOLDER}
          value={eft}
          onChange={(e) => {
            setEft(e.target.value)
            parse.reset()
          }}
        />
        <span className="muted small">In game: Fitting window → Copy to clipboard, then paste it here.</span>
      </div>
      <div className="scan-field">
        <label htmlFor="fitting-name">
          Name <span className="muted">(optional, defaults to the fit name)</span>
        </label>
        <input id="fitting-name" type="text" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {preview ? (
        <div className="panel" aria-live="polite">
          {preview.ship ? (
            <p>
              <strong>{preview.ship.name}</strong> · {preview.items.length} item types
            </p>
          ) : (
            <p role="alert" className="warn">
              The ship hull in the header was not recognised.
            </p>
          )}
          {unmatched.length > 0 ? (
            <>
              <p role="alert" className="warn">
                Not recognised: {unmatched.join(', ')}
              </p>
              <label>
                <input type="checkbox" checked={ignoreUnmatched} onChange={(e) => setIgnoreUnmatched(e.target.checked)} /> Save without
                these items
              </label>
            </>
          ) : null}
        </div>
      ) : null}
      <WriteError error={parse.error} fallback="Could not read that fitting." />
      <WriteError error={save.error} fallback="Could not save the fitting." />
      <div className="form-actions">
        <button type="button" className="button" disabled={eft.trim() === '' || parse.isPending} onClick={() => parse.mutate(eft)}>
          Preview
        </button>
        <button type="submit" className="button" disabled={eft.trim() === '' || save.isPending}>
          Save fitting
        </button>
      </div>
    </form>
  )
}

function FittingCard({ fitting, scope, canManage }: { fitting: Fitting; scope: FittingScope; canManage: boolean }) {
  const remove = useDeleteFitting(scope)
  const fitted = fitting.items.filter((i) => i.section === 'fitted')
  const cargo = fitting.items.filter((i) => i.section !== 'fitted')
  return (
    <li className="panel structure">
      <div className="structure-head">
        <strong>{fitting.name}</strong>
        <span className="badge">{fitting.ship_type_name}</span>
        {canManage ? (
          <span className="structure-actions">
            <button
              type="button"
              className="button"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete ${fitting.name}?`)) remove.mutate(fitting.id)
              }}
            >
              Delete
            </button>
          </span>
        ) : null}
      </div>
      <details>
        <summary>
          {fitted.length} fitted types · {cargo.length} cargo and drone types
        </summary>
        <ul className="small">
          {fitting.items.map((i) => (
            <li key={i.type_id}>
              {formatQty(i.quantity)} × {i.name} {i.section === 'fitted' ? '' : <span className="muted">(cargo / drones)</span>}
            </li>
          ))}
        </ul>
      </details>
      <WriteError error={remove.error} fallback="Could not delete the fitting." />
    </li>
  )
}

/** My Fittings (personal) or the corporation's fittings, depending on `scope`. */
export function FittingsView({ scope }: { scope: FittingScope }) {
  const fittings = useFittings(scope)
  const corporate = scope === 'corporate'
  const data = fittings.data

  return (
    <>
      <h1>{corporate ? 'Corporate fittings' : 'My fittings'}</h1>
      <p>
        {corporate
          ? 'Fittings shared by your corporation. The corporate fitting program checks them against the corporation’s assets.'
          : 'Fittings you want to build as fitted ships. The fitting program checks them against your own assets.'}{' '}
        <Link to={corporate ? '/corporate/fitting-program' : '/fitting-program'}>Open the fitting program</Link>
      </p>
      {fittings.isPending ? <p>Loading fittings…</p> : null}
      {fittings.isError ? (
        <p role="alert" className="panel warn">
          {fittings.error.message}
        </p>
      ) : null}
      {data && corporate && !data.enabled ? (
        <p className="panel">
          Corporate build programs are not enabled for your corporation yet. A Director or CEO can enable them on the{' '}
          <Link to="/corporate/build-programs">corporate build programs</Link> page; fittings use the same access rules.
        </p>
      ) : null}
      {data && corporate && data.enabled && !data.canView ? (
        <p className="panel">You need a character in the corporation to see its fittings.</p>
      ) : null}
      {data && (!corporate || (data.enabled && data.canView)) ? (
        <div className="scan-layout">
          {data.canManage ? (
            <FittingForm scope={scope} />
          ) : (
            <p className="panel">Only a Director, CEO or Factory Manager can add or remove corporate fittings.</p>
          )}
          <div>
            {corporate && data.corporationName ? <h2 className="subhead">{data.corporationName}</h2> : null}
            {data.fittings.length === 0 ? <p className="panel">No fittings yet.</p> : null}
            <ul className="structure-list">
              {data.fittings.map((f) => (
                <FittingCard key={f.id} fitting={f} scope={scope} canManage={data.canManage} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
