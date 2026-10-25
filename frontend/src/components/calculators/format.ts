import { formatIsk } from '../format'

/** 1d 2h 3m 4s: days and hours appear once the duration is long enough to need them. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0 || d > 0) parts.push(`${h}h`)
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
  parts.push(`${s % 60}s`)
  return parts.join(' ')
}

/** 12.34 ISK / 1.50K ISK / 2.00M ISK. */
export function isk(value: number): string {
  return `${formatIsk(value)} ISK`
}

/** A signed ISK amount: +1.50K ISK or -2.00M ISK. */
export function signedIsk(value: number): string {
  return `${value >= 0 ? '+' : '-'}${formatIsk(Math.abs(value))} ISK`
}

const volumeFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1,234.50 m³ */
export function formatVolume(m3: number): string {
  return `${volumeFormat.format(m3)} m³`
}

/** Percent with the sign colour class the pages share. */
export function profitClass(value: number): string {
  return value >= 0 ? 'text-profit' : 'text-loss'
}

/** Strip a trailing " Blueprint" so the product name reads naturally. */
export function productName(blueprintName: string): string {
  return blueprintName.replace(/ Blueprint$/, '')
}

/** Quote a CSV cell. */
export function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}
