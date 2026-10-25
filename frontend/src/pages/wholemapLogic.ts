/** Wormhole space solar system ids (J-systems). */
export const WH_SYSTEM_ID_MIN = 31_000_000
export const WH_SYSTEM_ID_MAX = 32_000_000

export const isWormholeSystem = (id: number) => id >= WH_SYSTEM_ID_MIN && id < WH_SYSTEM_ID_MAX

export const SIG_TYPES = ['unknown', 'combat', 'data', 'relic', 'ore', 'gas', 'wormhole', 'ghost'] as const
export type SigType = (typeof SIG_TYPES)[number]

export type Size = 'small' | 'medium' | 'large' | 'xlarge'
export type Life = 'stable' | 'critical'
export type Mass = 'stable' | 'destab' | 'critical'

/**
 * Fields of a wormhole "Show Info" window: size, lifetime and mass stability,
 * as far as the text mentions them. The wording is the game's.
 */
export function parseWormholeInfo(text: string): { size?: Size; life?: Life; mass?: Mass } {
  const out: { size?: Size; life?: Life; mass?: Mass } = {}

  const size = text.match(/Maximum Ship Size:\s*(.+)/i)?.[1]?.trim().toLowerCase()
  if (size) {
    if (size.includes('very large') || size.includes('capital')) out.size = 'xlarge'
    else if (size.includes('large')) out.size = 'large'
    else if (size.includes('medium')) out.size = 'medium'
    else if (size.includes('small')) out.size = 'small'
  }

  const life = text.match(/Lifetime:\s*(.+)/i)?.[1]?.trim().toLowerCase()
  if (life) {
    const ending = ['end of', 'less than 1 day', 'reaching the end', 'beginning to decay'].some((w) => life.includes(w))
    out.life = ending ? 'critical' : 'stable'
  }

  const mass = text.match(/Mass Stability:\s*(.+)/i)?.[1]?.trim().toLowerCase()
  if (mass) {
    if (mass.includes('verge of collapse') || mass.includes('critical')) out.mass = 'critical'
    else if (['not yet', 'has had', 'less than half', 'destab'].some((w) => mass.includes(w))) out.mass = 'destab'
    else out.mass = 'stable'
  }

  return out
}

/** True for probe scanner rows: tab-separated with an `ABC-123` code first. */
export function looksLikeSignatureData(text: string): boolean {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .some((line) => {
      const cols = line.split('\t')
      return cols.length >= 3 && /^[A-Z]{3}-\d{3}$/.test((cols[0] ?? '').trim())
    })
}

export interface Tracked {
  id: number
  name: string
}

export interface HistoryEntry extends Tracked {
  time: string
}

const TRACKED_KEY = 'wholemap_tracked_system'
const CHARACTER_KEY = 'wholemap_tracking_character_id'
const HISTORY_KEY = 'wholemap_location_history'
export const MAX_HISTORY = 20

// Browser storage can be blocked or empty; the page works without it.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = read(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function getTracked(): Tracked | null {
  const data = readJson<Tracked>(TRACKED_KEY)
  return data && data.id ? data : null
}

export const setTracked = (t: Tracked | null) => write(TRACKED_KEY, t === null ? null : JSON.stringify(t))

export const getTrackingCharacter = (): number | null => {
  const raw = read(CHARACTER_KEY)
  return raw === null ? null : Number(raw)
}

export const setTrackingCharacter = (id: number | null) => write(CHARACTER_KEY, id === null ? null : String(id))

export const getHistory = (): HistoryEntry[] => {
  const list = readJson<HistoryEntry[]>(HISTORY_KEY)
  return Array.isArray(list) ? list : []
}

export function addHistory(entry: Tracked, now: Date = new Date()): HistoryEntry[] {
  const next = [{ ...entry, time: now.toISOString() }, ...getHistory()].slice(0, MAX_HISTORY)
  write(HISTORY_KEY, JSON.stringify(next))
  return next
}

export const clearHistory = () => write(HISTORY_KEY, null)
