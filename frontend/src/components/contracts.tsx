/** Contract type as shown in lists: "item exchange". */
export function ContractTypeBadge({ type }: { type: string }) {
  return <span className={`badge badge-type badge-${type}`}>{type.replace(/_/g, ' ')}</span>
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** "20 Oct, 10:00" in UTC (game time), or a dash. */
export function formatWhen(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : '—'
}

/** ISK with two decimals and grouping, or a dash for nothing. */
export function formatExact(value: number | null | undefined, unit = 'ISK'): string {
  if (value === null || value === undefined || value <= 0) return '—'
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`.trim()
}
