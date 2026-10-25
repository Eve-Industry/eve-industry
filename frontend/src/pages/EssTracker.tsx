import { useEffect, useState, type FormEvent } from 'react'
import {
  useEssSystems,
  useLogEssPayout,
  useRemoveEssSystem,
  useTrackEssSystem,
  useUpdateEssSystem,
  type EssRequest,
} from '../api/corp'
import { ErrorNotice, formatDuration, formatIskWhole, formatUtc, WriteError } from '../components/CorpCommon'
import { SystemPicker, type PickedSystem } from '../components/SystemPicker'

type EssSystem = NonNullable<ReturnType<typeof useEssSystems>['data']>['data'][number]

/**
 * Seconds until the next payout. The server's `next_payout_at` goes stale as
 * the clock runs past it, so roll it forward by whole cycles.
 */
export function secondsUntilPayout(nextPayoutAt: string, cycleMinutes: number, nowMs: number): number {
  const cycle = Math.max(1, cycleMinutes) * 60
  let diff = Math.round((Date.parse(nextPayoutAt) - nowMs) / 1000)
  if (diff <= 0) diff += Math.ceil((1 - diff) / cycle) * cycle
  return diff
}

/** H:MM:SS */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function Countdown({ system }: { system: EssSystem }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="badge">in {formatCountdown(secondsUntilPayout(system.next_payout_at, system.cycle_minutes, now))}</span>
}

/** Two number inputs, hours and minutes. Blank means "not given". */
function HoursMinutes({
  id,
  label,
  hours,
  minutes,
  onChange,
}: {
  id: string
  label: string
  hours: string
  minutes: string
  onChange: (hours: string, minutes: string) => void
}) {
  return (
    <fieldset className="hm">
      <legend className="small">{label}</legend>
      <label className="visually-hidden" htmlFor={`${id}-h`}>
        {label} hours
      </label>
      <input id={`${id}-h`} type="number" min={0} max={24} inputMode="numeric" value={hours} onChange={(e) => onChange(e.target.value, minutes)} />
      <span className="muted">h</span>
      <label className="visually-hidden" htmlFor={`${id}-m`}>
        {label} minutes
      </label>
      <input id={`${id}-m`} type="number" min={0} max={1440} inputMode="numeric" value={minutes} onChange={(e) => onChange(hours, e.target.value)} />
      <span className="muted">m</span>
    </fieldset>
  )
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s))

/** The request body for a cycle form: next payout is sent only when filled in. */
export function cycleBody(f: { cycleH: string; cycleM: string; nextH: string; nextM: string; notes: string }): EssRequest {
  const body: EssRequest = { cycle_hours: num(f.cycleH) ?? 0, cycle_minutes: num(f.cycleM) ?? 0, notes: f.notes.trim() || null }
  if (f.nextH.trim() !== '' || f.nextM.trim() !== '') {
    body.next_payout_in_hours = num(f.nextH) ?? 0
    body.next_payout_in_minutes = num(f.nextM) ?? 0
  }
  return body
}

function AddForm() {
  const track = useTrackEssSystem()
  const [system, setSystem] = useState<PickedSystem | null>(null)
  const [f, setF] = useState({ cycleH: '2', cycleM: '45', nextH: '0', nextM: '0', notes: '' })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!system) return
    track.mutate(
      { ...cycleBody(f), solar_system_id: system.id, solar_system_name: system.name },
      { onSuccess: () => setSystem(null) },
    )
  }

  return (
    <form className="panel scan-form" onSubmit={submit}>
      <h2>Add / update system</h2>
      <SystemPicker id="ess-system" label="Solar system" value={system} onChange={setSystem} />
      <HoursMinutes id="ess-cycle" label="Cycle length" hours={f.cycleH} minutes={f.cycleM} onChange={(cycleH, cycleM) => setF({ ...f, cycleH, cycleM })} />
      <p className="muted small">The default ESS payout cycle is 2h 45m.</p>
      <HoursMinutes id="ess-next" label="Time until next payout" hours={f.nextH} minutes={f.nextM} onChange={(nextH, nextM) => setF({ ...f, nextH, nextM })} />
      <p className="muted small">How long from now until the next payout. The schedule is calculated from this.</p>
      <div className="scan-field">
        <label htmlFor="ess-notes">Notes</label>
        <textarea id="ess-notes" rows={2} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
      <button type="submit" className="button" disabled={!system || track.isPending}>
        Save system
      </button>
      <WriteError error={track.error} fallback="Could not save the system." />
    </form>
  )
}

function SystemCard({ system }: { system: EssSystem }) {
  const update = useUpdateEssSystem()
  const remove = useRemoveEssSystem()
  const log = useLogEssPayout()
  const [f, setF] = useState({
    cycleH: String(Math.floor(system.cycle_minutes / 60)),
    cycleM: String(system.cycle_minutes % 60),
    nextH: '',
    nextM: '',
    notes: system.notes ?? '',
  })
  const [payout, setPayout] = useState({ at: '', amount: '' })

  return (
    <article className="panel ess-system">
      <div className="slot-head">
        <div>
          <strong>{system.solar_system_name}</strong>
          <div className="muted small">Cycle: {formatDuration(system.cycle_minutes)}</div>
          <div className="small">
            Next payout: <span className="text-manufacturing">{formatUtc(system.next_payout_at)} UTC</span>{' '}
            <Countdown system={system} />
          </div>
          {system.notes ? <div className="muted small">{system.notes}</div> : null}
        </div>
        <button
          type="button"
          className="button"
          disabled={remove.isPending}
          aria-label={`Remove ${system.solar_system_name}`}
          onClick={() => {
            if (window.confirm('Remove this system from the tracker?')) remove.mutate(system.id)
          }}
        >
          Remove
        </button>
      </div>
      <WriteError error={remove.error} fallback="Could not remove the system." />

      <div className="ess-forms">
        <form
          className="scan-form"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ id: system.id, body: cycleBody(f) }, { onSuccess: () => setF({ ...f, nextH: '', nextM: '' }) })
          }}
        >
          <HoursMinutes id={`cycle-${system.id}`} label="Cycle" hours={f.cycleH} minutes={f.cycleM} onChange={(cycleH, cycleM) => setF({ ...f, cycleH, cycleM })} />
          <HoursMinutes id={`next-${system.id}`} label="Next payout in (blank keeps it)" hours={f.nextH} minutes={f.nextM} onChange={(nextH, nextM) => setF({ ...f, nextH, nextM })} />
          <button type="submit" className="button" disabled={update.isPending}>
            Update
          </button>
          <WriteError error={update.error} fallback="Could not update the cycle." />
        </form>

        <form
          className="scan-form"
          onSubmit={(e) => {
            e.preventDefault()
            log.mutate(
              {
                id: system.id,
                body: {
                  occurred_at: payout.at ? `${payout.at}:00Z` : undefined,
                  amount_isk: payout.amount === '' ? undefined : Number(payout.amount),
                },
              },
              { onSuccess: () => setPayout({ at: '', amount: '' }) },
            )
          }}
        >
          <div className="scan-field">
            <label htmlFor={`at-${system.id}`}>Payout at (UTC)</label>
            <input id={`at-${system.id}`} type="datetime-local" value={payout.at} onChange={(e) => setPayout({ ...payout, at: e.target.value })} />
          </div>
          <div className="scan-field">
            <label htmlFor={`amount-${system.id}`}>Amount (ISK)</label>
            <input id={`amount-${system.id}`} type="number" step="0.01" min={0} value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} />
          </div>
          <button type="submit" className="button" disabled={log.isPending}>
            Log payout
          </button>
          <WriteError error={log.error} fallback="Could not record the payout." />
        </form>
      </div>

      {system.recent_payouts.length > 0 ? (
        <div className="small">
          <div className="muted">Recent payouts</div>
          <ul className="plain-list">
            {system.recent_payouts.map((p) => (
              <li key={p.id}>
                {p.occurred_at ? formatUtc(p.occurred_at) : '—'} UTC
                {p.amount_isk !== null ? <span className="text-profit"> · {formatIskWhole(p.amount_isk)}</span> : null}
                {p.notes ? <span className="muted"> · {p.notes}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}

export default function EssTracker() {
  const ess = useEssSystems()

  return (
    <>
      <h1>ESS payout cycle tracker</h1>
      {ess.isPending ? (
        <p>Loading the tracker…</p>
      ) : ess.isError ? (
        <ErrorNotice error={ess.error} what="the ESS tracker" unavailable="ESS tracker unavailable:" />
      ) : (
        <div className="split">
          <AddForm />
          <section aria-labelledby="tracked-heading">
            <h2 id="tracked-heading">Tracked systems</h2>
            {ess.data.data.length === 0 ? (
              <p className="panel muted">No systems tracked yet. Add one to see its next payout.</p>
            ) : (
              <div className="chars">
                {ess.data.data.map((s) => (
                  <SystemCard key={s.id} system={s} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}
