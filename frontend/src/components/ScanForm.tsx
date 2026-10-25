import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

/** The five trade hubs (MarketTradingService::REGIONS). */
export const REGIONS = [
  ['10000002', 'The Forge (Jita)'],
  ['10000043', 'Domain (Amarr)'],
  ['10000032', 'Sinq Laison (Dodixie)'],
  ['10000030', 'Heimatar (Rens)'],
  ['10000042', 'Metropolis (Hek)'],
] as const

export type RegionId = (typeof REGIONS)[number][0]

export interface ScanField {
  name: string
  label: string
  /** A select of the trade hubs when 'region', else a number input. */
  kind: 'region' | 'number'
  hint?: string
  min?: number
  max?: number
  step?: number
}

/** Blank fields fall back to the server default instead of sending an empty string. */
export function numberParam(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * The inputs of a market scan. `values` are the applied parameters (from the
 * URL); typing only changes a draft until the form is submitted.
 */
export function ScanForm({
  fields,
  values,
  submitLabel,
  onSubmit,
}: {
  fields: ScanField[]
  values: Record<string, string>
  submitLabel: string
  onSubmit: (values: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState(values)

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(draft)
  }

  return (
    <form className="panel scan-form" onSubmit={submit}>
      {fields.map((field) => {
        const id = `scan-${field.name}`
        return (
          <div key={field.name} className="scan-field">
            <label htmlFor={id}>
              {field.label} {field.hint ? <span className="muted">{field.hint}</span> : null}
            </label>
            {field.kind === 'region' ? (
              <select id={id} value={draft[field.name]} onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value })}>
                {REGIONS.map(([regionId, name]) => (
                  <option key={regionId} value={regionId}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                value={draft[field.name]}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => setDraft({ ...draft, [field.name]: e.target.value })}
              />
            )}
          </div>
        )
      })}
      <button type="submit" className="button">
        {submitLabel}
      </button>
    </form>
  )
}

/** Scan parameters and page number, kept in the URL so a scan can be shared and survives reload. */
export function useScanParams(defaults: Record<string, string>) {
  const [params, setParams] = useSearchParams()
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(defaults).map(([k, fallback]) => [k, params.get(k) ?? fallback]),
  )
  const page = Math.max(1, Number(params.get('page')) || 1)
  return {
    values,
    page,
    /** Apply new parameters and go back to page 1. */
    apply: (next: Record<string, string>) => setParams(next),
    setPage: (p: number) => setParams({ ...values, page: String(p) }),
  }
}
