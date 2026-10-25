import { ApiError } from '../api/client'

/** 1,234,567 ISK, whole numbers (wallet amounts). */
export function formatIskWhole(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} ISK`
}

/** "2026-10-21 12:00" in UTC from an ISO 8601 string. */
export function formatUtc(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ')
}

/** "2h 45m" from minutes. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** The most specific text of a failed write: first validation error, else the message, else the fallback. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
    return first ?? (error.message.startsWith('Request failed') ? fallback : error.message)
  }
  return fallback
}

export function isStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status
}

/**
 * A failed page load. A 403 shows the server's message, which says what to
 * fix; 404 says the page does not exist; anything else is generic.
 */
export function ErrorNotice({ error, what, unavailable }: { error: unknown; what: string; unavailable: string }) {
  if (isStatus(error, 403)) {
    return (
      <p role="alert" className="panel warn">
        <strong>{unavailable}</strong> {(error as ApiError).message}
      </p>
    )
  }
  if (isStatus(error, 404)) {
    return (
      <p role="alert" className="panel warn">
        Not found.
      </p>
    )
  }
  return <p role="alert">Could not load {what}.</p>
}

/** A failed write, shown under the form that sent it. */
export function WriteError({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) return null
  return (
    <p role="alert" className="panel warn">
      {errorText(error, fallback)}
    </p>
  )
}
