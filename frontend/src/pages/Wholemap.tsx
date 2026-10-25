import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, unwrap } from '../api/client'
import {
  useAddConnection,
  useAddSignature,
  useCurrentLocation,
  useDeleteConnection,
  useDeleteSignature,
  useDeleteSystemNote,
  useJumpLogs,
  useLogJump,
  useMe,
  usePasteSignatures,
  useSaveSystemNote,
  useSystemSearch,
  useToggleSignatureLock,
  useUpdateSignature,
  useWholemap,
} from '../api/queries'
import type { components } from '../api/schema'
import { formatAge } from '../components/FreshnessBadge'
import { Modal } from '../components/Modal'
import {
  SIG_TYPES,
  addHistory,
  clearHistory,
  getHistory,
  getTracked,
  getTrackingCharacter,
  isWormholeSystem,
  looksLikeSignatureData,
  parseWormholeInfo,
  setTracked,
  setTrackingCharacter,
  type HistoryEntry,
  type Life,
  type Mass,
  type Size,
  type Tracked,
} from './wholemapLogic'

type Signature = components['schemas']['SignatureResource']
type Connection = components['schemas']['ConnectionResource']
type Note = components['schemas']['SystemNoteResource']

type Dialog =
  | { kind: 'add-sig' }
  | { kind: 'edit-sig'; sig: Signature }
  | { kind: 'paste' }
  | { kind: 'connect'; sigId: number; systemId: number; systemName: string }
  | { kind: 'note'; note?: Note }
  | { kind: 'log-jump'; connectionId: number }
  | { kind: 'jumps'; connectionId: number }

const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
    return first ?? error.message
  }
  return fallback
}

/** A text box that searches solar systems and reports the one picked. */
function SystemPicker({ label, value, onPick, readOnlyHint }: { label: string; value: Tracked | null; onPick: (system: Tracked | null) => void; readOnlyHint?: string }) {
  const [text, setText] = useState(value?.name ?? '')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const id = useRef(`sys-${Math.random().toString(36).slice(2)}`).current

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 300)
    return () => clearTimeout(timer)
  }, [text])
  const search = useSystemSearch(q)
  const results = search.data?.data ?? []

  return (
    <div className="scan-field system-picker">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder="Search system…"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          if (value) onPick(null)
        }}
      />
      {readOnlyHint ? <span className="muted small">{readOnlyHint}</span> : null}
      {open && q.length >= 2 && !value ? (
        <ul className="corp-results" aria-label={`${label} suggestions`}>
          {search.isPending ? <li className="muted">Searching…</li> : null}
          {search.isSuccess && results.length === 0 ? <li className="muted">No systems found</li> : null}
          {results.map((s) => (
            <li key={s.solar_system_id}>
              <button className="option"
                type="button"
                onClick={() => {
                  setText(s.solar_system_name)
                  setOpen(false)
                  onPick({ id: s.solar_system_id, name: s.solar_system_name })
                }}
              >
                {s.solar_system_name}{' '}
                <span className={s.security >= 0.5 ? 'text-profit' : s.security > 0 ? 'text-tax' : s.security <= -0.99 ? 'text-research' : 'text-loss'}>
                  ({s.security.toFixed(1)})
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SignatureDialog({ edit, defaultSystem, onClose }: { edit?: Signature; defaultSystem: Tracked | null; onClose: () => void }) {
  const add = useAddSignature()
  const update = useUpdateSignature()
  const [system, setSystem] = useState<Tracked | null>(defaultSystem)
  const [code, setCode] = useState(edit?.signature_id ?? '')
  const [type, setType] = useState(edit?.type ?? 'unknown')
  const [name, setName] = useState(edit?.name ?? '')
  const [bookmark, setBookmark] = useState(edit?.bookmark ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const pending = add.isPending || update.isPending

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const fields = {
      signature_id: code.trim() === '' ? null : code.trim(),
      type: type as (typeof SIG_TYPES)[number],
      name: name === '' ? null : name,
      bookmark: bookmark === '' ? null : bookmark,
      description: description === '' ? null : description,
    }
    try {
      if (edit) await update.mutateAsync({ id: edit.id, ...fields })
      else {
        if (!system) return setError('Please select a system')
        await add.mutateAsync({ system_id: system.id, system_name: system.name, ...fields })
      }
      onClose()
    } catch (err) {
      setError(errorText(err, 'Failed to save the signature.'))
    }
  }

  return (
    <Modal title={edit ? 'Edit signature' : 'Add signature'} onClose={onClose}>
      <form className="scan-form" onSubmit={submit}>
        {edit ? null : <SystemPicker label="System" value={system} onPick={setSystem} />}
        <div className="scan-field">
          <label htmlFor="sig-code">Signature ID</label>
          <input id="sig-code" type="text" maxLength={7} placeholder="ABC-123" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="scan-field">
          <label htmlFor="sig-type">Type</label>
          <select id="sig-type" value={type} onChange={(e) => setType(e.target.value)}>
            {SIG_TYPES.map((t) => (
              <option key={t} value={t}>
                {cap(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="scan-field">
          <label htmlFor="sig-name">Name</label>
          <input id="sig-name" type="text" placeholder="Optional name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="scan-field">
          <label htmlFor="sig-bookmark">Bookmark</label>
          <input id="sig-bookmark" type="text" placeholder="Optional bookmark" value={bookmark} onChange={(e) => setBookmark(e.target.value)} />
        </div>
        <div className="scan-field">
          <label htmlFor="sig-description">Description</label>
          <textarea id="sig-description" rows={2} placeholder="Optional notes" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error ? <p role="alert" className="text-loss small">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={pending}>
            {edit ? 'Save changes' : 'Add signature'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PasteDialog({ defaultSystem, onClose, onDone }: { defaultSystem: Tracked | null; onClose: () => void; onDone: (message: string) => void }) {
  const paste = usePasteSignatures()
  const [system, setSystem] = useState<Tracked | null>(defaultSystem)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!system) return setError('Please select a system')
    if (text.trim() === '') return setError('Please paste signature data')
    try {
      const res = await paste.mutateAsync({ system_id: system.id, system_name: system.name, paste: text })
      onDone(`Imported: ${res.data.created} new, ${res.data.updated} updated signatures for ${system.name}`)
      onClose()
    } catch (err) {
      setError(errorText(err, 'Failed to import signatures.'))
    }
  }

  return (
    <Modal title="Paste signatures" onClose={onClose}>
      <form className="scan-form" onSubmit={submit}>
        <SystemPicker label="System" value={system} onPick={setSystem} />
        <div className="scan-field">
          <label htmlFor="paste-text">Paste scanner results</label>
          <textarea
            id="paste-text"
            rows={8}
            placeholder="Copy signatures from the EVE probe scanner and paste here…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {error ? <p role="alert" className="text-loss small">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={paste.isPending}>
            Import signatures
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ConnectionDialog({ sigId, fromId, fromName, onClose }: { sigId: number; fromId: number; fromName: string; onClose: () => void }) {
  const add = useAddConnection()
  const [to, setTo] = useState<Tracked | null>(null)
  const [info, setInfo] = useState('')
  const [type, setType] = useState('')
  const [life, setLife] = useState<Life>('stable')
  const [mass, setMass] = useState<Mass>('stable')
  const [size, setSize] = useState<Size>('large')
  const [error, setError] = useState<string | null>(null)

  function parse() {
    const found = parseWormholeInfo(info)
    if (found.size) setSize(found.size)
    if (found.life) setLife(found.life)
    if (found.mass) setMass(found.mass)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await add.mutateAsync({
        signature_id: sigId,
        from_system_id: fromId,
        from_system_name: fromName,
        to_system_id: to?.id ?? null,
        to_system_name: to?.name ?? null,
        wormhole_type: type.trim() === '' ? null : type.trim(),
        size,
        life,
        mass,
      })
      onClose()
    } catch (err) {
      setError(errorText(err, 'Failed to add the connection.'))
    }
  }

  return (
    <Modal title="Add wormhole connection" onClose={onClose}>
      <form className="scan-form" onSubmit={submit}>
        <div className="scan-field">
          <label htmlFor="conn-info">Paste wormhole info (optional)</label>
          <textarea
            id="conn-info"
            rows={3}
            placeholder="Paste the wormhole's Show Info text here to fill in the fields below…"
            value={info}
            onChange={(e) => setInfo(e.target.value)}
          />
          <button type="button" className="button" onClick={parse}>
            Parse info
          </button>
        </div>
        <div className="scan-field">
          <label htmlFor="conn-from">From system</label>
          <input id="conn-from" type="text" value={fromName} readOnly />
        </div>
        <SystemPicker label="To system" value={to} onPick={setTo} />
        <div className="scan-field">
          <label htmlFor="conn-type">Wormhole type</label>
          <input id="conn-type" type="text" maxLength={10} placeholder="e.g. C140, K162, N770" value={type} onChange={(e) => setType(e.target.value)} />
        </div>
        <div className="scan-field">
          <label htmlFor="conn-life">Life status</label>
          <select id="conn-life" value={life} onChange={(e) => setLife(e.target.value as Life)}>
            <option value="stable">Stable</option>
            <option value="critical">Critical (EOL)</option>
          </select>
        </div>
        <div className="scan-field">
          <label htmlFor="conn-mass">Mass status</label>
          <select id="conn-mass" value={mass} onChange={(e) => setMass(e.target.value as Mass)}>
            <option value="stable">Stable</option>
            <option value="destab">Destabilized</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="scan-field">
          <label htmlFor="conn-size">Size</label>
          <select id="conn-size" value={size} onChange={(e) => setSize(e.target.value as Size)}>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="xlarge">X-Large</option>
          </select>
        </div>
        {error ? <p role="alert" className="text-loss small">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={add.isPending}>
            Add connection
          </button>
        </div>
      </form>
    </Modal>
  )
}

function NoteDialog({ note, defaultSystem, onClose }: { note?: Note; defaultSystem: Tracked | null; onClose: () => void }) {
  const save = useSaveSystemNote()
  const [system, setSystem] = useState<Tracked | null>(note ? { id: note.system_id, name: note.system_name ?? String(note.system_id) } : defaultSystem)
  const [status, setStatus] = useState(note?.status ?? 'unknown')
  const [comment, setComment] = useState(note?.comment ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!system) return setError('Please select a system')
    try {
      await save.mutateAsync({
        system_id: system.id,
        system_name: system.name,
        status: status as 'unknown' | 'friendly' | 'occupied' | 'hostile',
        comment: comment === '' ? null : comment,
      })
      onClose()
    } catch (err) {
      setError(errorText(err, 'Failed to save the note.'))
    }
  }

  return (
    <Modal title={note ? 'Edit system note' : 'Add system note'} onClose={onClose}>
      <form className="scan-form" onSubmit={submit}>
        <SystemPicker label="System" value={system} onPick={setSystem} />
        <div className="scan-field">
          <label htmlFor="note-status">Status</label>
          <select id="note-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="unknown">Unknown</option>
            <option value="friendly">Friendly</option>
            <option value="occupied">Occupied</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
        <div className="scan-field">
          <label htmlFor="note-comment">Comment</label>
          <textarea id="note-comment" rows={3} placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {error ? <p role="alert" className="text-loss small">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={save.isPending}>
            Save note
          </button>
        </div>
      </form>
    </Modal>
  )
}

function LogJumpDialog({ connectionId, defaultName, onClose }: { connectionId: number; defaultName: string; onClose: () => void }) {
  const log = useLogJump()
  const [character, setCharacter] = useState(defaultName)
  const [ship, setShip] = useState('')
  const [mass, setMass] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await log.mutateAsync({
        connection_id: connectionId,
        character_name: character.trim() === '' ? null : character.trim(),
        ship_type_name: ship.trim() === '' ? null : ship.trim(),
        ship_mass: mass.trim() === '' ? null : Number(mass),
      })
      onClose()
    } catch (err) {
      setError(errorText(err, 'Failed to log the jump.'))
    }
  }

  return (
    <Modal title="Log jump" onClose={onClose}>
      <form className="scan-form" onSubmit={submit}>
        <div className="scan-field">
          <label htmlFor="jump-character">Character name</label>
          <input id="jump-character" type="text" value={character} onChange={(e) => setCharacter(e.target.value)} />
        </div>
        <div className="scan-field">
          <label htmlFor="jump-ship">Ship type</label>
          <input id="jump-ship" type="text" placeholder="e.g. Astero, Stratios" value={ship} onChange={(e) => setShip(e.target.value)} />
        </div>
        <div className="scan-field">
          <label htmlFor="jump-mass">Ship mass (kg)</label>
          <input id="jump-mass" type="number" min={0} value={mass} onChange={(e) => setMass(e.target.value)} />
        </div>
        {error ? <p role="alert" className="text-loss small">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={log.isPending}>
            Log jump
          </button>
        </div>
      </form>
    </Modal>
  )
}

function JumpsDialog({ connectionId, onClose }: { connectionId: number; onClose: () => void }) {
  const logs = useJumpLogs(connectionId)
  const rows = logs.data?.data ?? []
  return (
    <Modal title="Jump history" onClose={onClose}>
      {logs.isPending ? <p>Loading…</p> : null}
      {logs.isError ? <p role="alert">{errorText(logs.error, 'Could not load the jump history.')}</p> : null}
      {logs.isSuccess && rows.length === 0 ? <p className="muted">No jumps logged yet.</p> : null}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Character</th>
                <th scope="col">Ship</th>
                <th scope="col" className="num">
                  Mass (kg)
                </th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id}>
                  <td>{j.character_name ?? '—'}</td>
                  <td>{j.ship_type_name ?? '—'}</td>
                  <td className="num">{j.ship_mass === null ? '—' : j.ship_mass.toLocaleString('en-US')}</td>
                  <td>{j.jumped_at ? new Date(j.jumped_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="modal-actions">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

export default function Wholemap() {
  const client = useQueryClient()
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const systemParam = params.get('system_id')
  const systemId = systemParam && /^\d+$/.test(systemParam) ? Number(systemParam) : null
  const map = useWholemap(systemId)

  const lock = useToggleSignatureLock()
  const delSig = useDeleteSignature()
  const delConn = useDeleteConnection()
  const delNote = useDeleteSystemNote()

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tracked, setTrackedState] = useState<Tracked | null>(() => getTracked())
  const [tracking, setTracking] = useState(() => getTracked() !== null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => getHistory())
  const [characterId, setCharacterId] = useState<number | null>(() => getTrackingCharacter())
  const [searchText, setSearchText] = useState('')
  const [searchQ, setSearchQ] = useState('')

  const allCharacters = me.data?.data.characters ?? []
  const mainName = allCharacters.find((c) => c.is_main)?.name ?? allCharacters[0]?.name ?? ''
  // Only characters with a working token can be located.
  const characters = allCharacters.filter((c) => c.is_esi_active)
  const effectiveCharacter = characterId ?? characters.find((c) => c.is_main)?.character_id ?? null

  function filterSystem(id: number | null) {
    setParams(id === null ? {} : { system_id: String(id) })
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearchQ(searchText.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchText])
  const searchResults = useSystemSearch(searchQ)

  // Tracking: poll the character's location and follow it through the chain.
  const location = useCurrentLocation(effectiveCharacter, tracking)
  const lastSeen = useRef<number | null>(tracked?.id ?? null)
  useEffect(() => {
    const here = location.data?.data
    if (!here) return
    if (lastSeen.current === here.solar_system_id) return
    const previous = lastSeen.current === null ? null : getTracked()
    lastSeen.current = here.solar_system_id
    const now = { id: here.solar_system_id, name: here.solar_system_name }
    setTracked(now)
    setTrackedState(now)
    setHistory(addHistory(now))
    setParams({ system_id: String(now.id) })
    // Jumped out of a wormhole signature's system into a J-system: offer to link it.
    if (previous && isWormholeSystem(now.id)) {
      void (async () => {
        try {
          const res = unwrap(await api.GET('/wholemap', { params: { query: { system_id: previous.id } } }))
          const open = res.data.signatures.find((s) => s.type === 'wormhole' && !s.connection)
          if (open) setDialog({ kind: 'connect', sigId: open.id, systemId: previous.id, systemName: previous.name })
        } catch {
          /* the prompt is a convenience */
        }
      })()
    }
  }, [location.data, setParams])

  function toggleTracking(on: boolean) {
    setTracking(on)
    if (on) {
      setTrackingCharacter(effectiveCharacter)
      return
    }
    setTracked(null)
    setTrackedState(null)
    setTrackingCharacter(null)
    lastSeen.current = null
    client.removeQueries({ queryKey: ['wholemap', 'location'] })
  }

  // Pasting scanner rows anywhere on the page imports them into the current system.
  const importSystem = systemId !== null && map.data ? map.data.data.systems.find((s) => s.system_id === systemId) : null
  const pasteTarget: Tracked | null = tracked ?? (importSystem?.system_name ? { id: importSystem.system_id, name: importSystem.system_name } : null)
  const paste = usePasteSignatures()
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      if (!pasteTarget) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!looksLikeSignatureData(text)) return
      e.preventDefault()
      paste.mutate(
        { system_id: pasteTarget.id, system_name: pasteTarget.name, paste: text },
        {
          onSuccess: (res) => setNotice(`Imported: ${res.data.created} new, ${res.data.updated} updated signatures for ${pasteTarget.name}`),
          onError: () => setActionError('Failed to import pasted signatures.'),
        },
      )
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [pasteTarget, paste])

  const data = map.data?.data
  const signatures = useMemo(() => data?.signatures ?? [], [data])
  const connections = data?.connections ?? []
  const notes = data?.notes ?? []
  const shown = typeFilter === 'all' ? signatures : signatures.filter((s) => s.type === typeFilter)

  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(errorText(err, fallback))
    }
  }

  if (map.isPending) return <p>Loading the wormhole map…</p>
  if (map.isError || !data) return <p role="alert">Could not load the wormhole map.</p>

  const statusClass = (s: string) => (s === 'friendly' ? 'text-profit' : s === 'occupied' ? 'text-tax' : s === 'hostile' ? 'text-loss' : 'muted')

  return (
    <>
      <div className="page-head">
        <h1>
          Wholemap <span className="muted small">Wormhole mapper</span>
        </h1>
        <div className="page-actions wrap">
          <div className="system-picker search">
            <label className="visually-hidden" htmlFor="wh-search">
              Search system
            </label>
            <input id="wh-search" type="search" autoComplete="off" placeholder="Search system…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            {searchQ.length >= 2 && searchResults.isSuccess ? (
              <ul className="corp-results" aria-label="Systems">
                {searchResults.data.data.length === 0 ? <li className="muted">No systems found</li> : null}
                {searchResults.data.data.map((s) => (
                  <li key={s.solar_system_id}>
                    <button className="option"
                      type="button"
                      onClick={() => {
                        setSearchText('')
                        setSearchQ('')
                        filterSystem(s.solar_system_id)
                      }}
                    >
                      {s.solar_system_name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {systemId !== null ? (
            <button type="button" className="button" onClick={() => filterSystem(null)}>
              Clear filter
            </button>
          ) : null}
          {characters.length > 1 ? (
            <>
              <label className="visually-hidden" htmlFor="track-character">
                Tracked character
              </label>
              <select
                id="track-character"
                value={effectiveCharacter ?? ''}
                onChange={(e) => {
                  const id = Number(e.target.value)
                  setCharacterId(id)
                  setTrackingCharacter(id)
                }}
              >
                {characters.map((c) => (
                  <option key={c.character_id} value={c.character_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label className="radio">
            <input type="checkbox" role="switch" checked={tracking} onChange={(e) => toggleTracking(e.target.checked)} /> Track
          </label>
          {tracked ? <span className="badge">{tracked.name}</span> : null}
        </div>
      </div>
      {tracking && location.isError ? (
        <p role="alert" className="small text-loss">
          Location tracking: {errorText(location.error, 'could not read your location.')}
        </p>
      ) : null}
      {notice ? (
        <p className="panel small" role="status">
          {notice}{' '}
          <button type="button" className="toggle" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ✕
          </button>
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="panel warn small">
          {actionError}
        </p>
      ) : null}

      <dl className="stats">
        <div className="panel">
          <dd>{signatures.length}</dd>
          <dt className="muted small">Signatures</dt>
        </div>
        <div className="panel">
          <dd className="sig-wormhole">{signatures.filter((s) => s.type === 'wormhole').length}</dd>
          <dt className="muted small">Wormholes</dt>
        </div>
        <div className="panel">
          <dd>{connections.length}</dd>
          <dt className="muted small">Connections</dt>
        </div>
        <div className="panel">
          <dd>{data.systems.length}</dd>
          <dt className="muted small">Systems mapped</dt>
        </div>
      </dl>

      <section className="panel" aria-labelledby="chain-title">
        <h2 id="chain-title" className="section-title">
          Wormhole chain
        </h2>
        {connections.length === 0 ? (
          <p className="muted">No wormhole connections mapped yet. Add a wormhole signature and create a connection.</p>
        ) : (
          <div className="chain-map">
            {connections.map((c) => (
              <div key={c.id} className="chain-link">
                <button
                  type="button"
                  className={tracked && tracked.id === c.from_system_id ? 'chain-node tracked' : 'chain-node'}
                  onClick={() => filterSystem(c.from_system_id)}
                >
                  <span className="system-name">{c.from_system_name ?? `J${c.from_system_id}`}</span>
                  <span className="muted small">{c.wormhole_type ?? '???'}</span>
                </button>
                <span className={`chain-connector life-${c.life} mass-${c.mass}`}>
                  <span className="line" />
                  {c.wormhole_type ?? '?'}
                  <span className="line" />
                </span>
                <button
                  type="button"
                  className={tracked && c.to_system_id !== null && tracked.id === c.to_system_id ? 'chain-node tracked' : 'chain-node'}
                  disabled={c.to_system_id === null}
                  onClick={() => (c.to_system_id === null ? undefined : filterSystem(c.to_system_id))}
                >
                  <span className="system-name">{c.to_system_name ?? '???'}</span>
                  <span className="small">
                    <span className={`life-${c.life}`}>{cap(c.life)}</span> / <span className={`mass-${c.mass}`}>{cap(c.mass)}</span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="wholemap-grid">
        <section className="panel" aria-labelledby="sig-title">
          <div className="page-head">
            <h2 id="sig-title" className="section-title">
              Signatures
            </h2>
            <div className="page-actions">
              <button type="button" className="button" onClick={() => setDialog({ kind: 'paste' })}>
                Paste
              </button>
              <button type="button" className="button" onClick={() => setDialog({ kind: 'add-sig' })}>
                Add
              </button>
            </div>
          </div>
          <div className="tiers" role="group" aria-label="Signature type">
            {['all', 'wormhole', 'data', 'relic', 'gas', 'ore', 'combat', 'ghost', 'unknown'].map((t) => (
              <button key={t} type="button" aria-pressed={typeFilter === t} className={typeFilter === t ? 'button tier active' : 'button tier'} onClick={() => setTypeFilter(t)}>
                {cap(t)}
              </button>
            ))}
          </div>
          {signatures.length === 0 ? (
            <p className="muted">No signatures recorded{systemId !== null ? ' for this system' : ''}.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">System</th>
                    <th scope="col">Type</th>
                    <th scope="col">Name</th>
                    <th scope="col">Bookmark</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.signature_id ?? '—'}</td>
                      <td>
                        <button type="button" className="link" onClick={() => filterSystem(s.system_id)}>
                          {s.system_name ?? s.system_id}
                        </button>
                      </td>
                      <td className={`sig-${s.type}`}>{cap(s.type)}</td>
                      <td>{s.name ?? '—'}</td>
                      <td>{s.bookmark ?? '—'}</td>
                      <td className="muted small">
                        {s.updated_at ? formatAge(s.updated_at) : '—'}
                        {s.updated_by ? ` by ${s.updated_by}` : ''}
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="button small"
                          aria-label={s.locked ? `Unlock ${s.signature_id ?? 'signature'}` : `Lock ${s.signature_id ?? 'signature'}`}
                          onClick={() => run(() => lock.mutateAsync(s.id), 'Failed to change the lock.')}
                        >
                          {s.locked ? 'Unlock' : 'Lock'}
                        </button>
                        {s.type === 'wormhole' && !s.connection ? (
                          <button
                            type="button"
                            className="button small"
                            onClick={() => setDialog({ kind: 'connect', sigId: s.id, systemId: s.system_id, systemName: s.system_name ?? String(s.system_id) })}
                          >
                            Link
                          </button>
                        ) : null}
                        <button type="button" className="button small" disabled={s.locked} onClick={() => setDialog({ kind: 'edit-sig', sig: s })}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button small"
                          onClick={() => {
                            if (window.confirm(`Delete signature ${s.signature_id ?? ''}?`)) void run(() => delSig.mutateAsync(s.id), 'Failed to delete the signature.')
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
        </section>

        <div className="wholemap-side">
          <section className="panel" aria-labelledby="conn-title">
            <h2 id="conn-title" className="section-title">
              Wormhole connections
            </h2>
            {connections.length === 0 ? <p className="muted">No connections yet.</p> : null}
            {connections.map((c: Connection) => (
              <div key={c.id} className="side-card">
                <div className="pi-line">
                  <strong className="small">
                    {c.from_system_name ?? c.from_system_id} → {c.to_system_name ?? '???'}
                  </strong>
                  <button
                    type="button"
                    className="button small"
                    onClick={() => {
                      if (window.confirm('Delete this connection and its jump logs?')) void run(() => delConn.mutateAsync(c.id), 'Failed to delete the connection.')
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="small">
                  Type: <span className="sig-wormhole">{c.wormhole_type ?? '??'}</span> · Size: <span className={`size-${c.size ?? 'large'}`}>{cap(c.size ?? 'large')}</span> · Life:{' '}
                  <span className={`life-${c.life}`}>{cap(c.life)}</span> · Mass: <span className={`mass-${c.mass}`}>{cap(c.mass)}</span>
                </div>
                {c.updated_at ? <div className="muted small">{formatAge(c.updated_at)}</div> : null}
                <div className="row-actions">
                  <button type="button" className="button small" onClick={() => setDialog({ kind: 'log-jump', connectionId: c.id })}>
                    Log jump
                  </button>
                  <button type="button" className="button small" onClick={() => setDialog({ kind: 'jumps', connectionId: c.id })}>
                    View jumps
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="panel" aria-labelledby="notes-title">
            <div className="page-head">
              <h2 id="notes-title" className="section-title">
                System notes
              </h2>
              <button type="button" className="button" onClick={() => setDialog({ kind: 'note' })}>
                Add note
              </button>
            </div>
            {notes.length === 0 ? <p className="muted">No system notes yet.</p> : null}
            {notes.map((n) => (
              <div key={n.id} className="side-card">
                <div className="pi-line">
                  <div>
                    <strong className="small">{n.system_name ?? n.system_id}</strong>{' '}
                    <span className={`badge ${statusClass(n.status)}`}>{cap(n.status)}</span>
                    {n.comment ? <div className="muted small">{n.comment}</div> : null}
                  </div>
                  <div className="row-actions">
                    <button type="button" className="button small" onClick={() => setDialog({ kind: 'note', note: n })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => {
                        if (window.confirm('Delete this note?')) void run(() => delNote.mutateAsync(n.id), 'Failed to delete the note.')
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="panel" aria-labelledby="history-title">
            <div className="page-head">
              <h2 id="history-title" className="section-title">
                Location history
              </h2>
              <button
                type="button"
                className="button small"
                onClick={() => {
                  clearHistory()
                  setHistory([])
                }}
              >
                Clear
              </button>
            </div>
            {history.length === 0 ? (
              <p className="muted small">No location history yet. Enable tracking to record jumps.</p>
            ) : (
              <ul className="history">
                {history.map((h, i) => (
                  <li key={`${h.time}-${i}`} className="pi-line small">
                    <button type="button" className={isWormholeSystem(h.id) ? 'link sig-wormhole' : 'link'} onClick={() => filterSystem(h.id)}>
                      {h.name}
                    </button>
                    <span className="muted">{new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {dialog?.kind === 'add-sig' ? <SignatureDialog defaultSystem={tracked ?? pasteTarget} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'edit-sig' ? <SignatureDialog edit={dialog.sig} defaultSystem={null} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'paste' ? <PasteDialog defaultSystem={tracked ?? pasteTarget} onClose={() => setDialog(null)} onDone={setNotice} /> : null}
      {dialog?.kind === 'connect' ? (
        <ConnectionDialog sigId={dialog.sigId} fromId={dialog.systemId} fromName={dialog.systemName} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'note' ? <NoteDialog note={dialog.note} defaultSystem={tracked ?? pasteTarget} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'log-jump' ? <LogJumpDialog connectionId={dialog.connectionId} defaultName={mainName} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'jumps' ? <JumpsDialog connectionId={dialog.connectionId} onClose={() => setDialog(null)} /> : null}
    </>
  )
}
