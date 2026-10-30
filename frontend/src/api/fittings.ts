import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, unwrap, type ApiErrorBody } from './client'
import type { components, operations } from './schema'

/** Personal fittings use your own assets; corporate ones use the corporation's. */
export type FittingScope = 'personal' | 'corporate'

export type PersonalFitting = components['schemas']['FittingResource']
export type CorporateFitting = components['schemas']['CorporationFittingResource']
export type Fitting = PersonalFitting | CorporateFitting

export type FittingPlan = operations['v1.fittings.program.plan']['responses'][200]['content']['application/json']['data']
export type FittingPlanItem = FittingPlan['items'][number]
/** A fitted or partly fitted ship you already have, as listed under its fitting. */
export type ExistingShip = FittingPlan['fittings'][number]['existing_ships'][number]

export interface PlanOptions {
  selections: Array<{ fitting_id: number; ships: number }>
  include_hull: boolean
  /** Count ships you already have fully fitted toward the ships wanted. */
  count_fitted_ships: boolean
  location_ids: number[]
}

export interface FittingList {
  fittings: Fitting[]
  /** Corporate fittings only work once corporate build programs are enabled. */
  enabled: boolean
  canView: boolean
  canManage: boolean
  corporationName: string | null
}

/** The fittings of a scope. Corporate also reports whether you may see and change them. */
export function useFittings(scope: FittingScope) {
  return useQuery({
    queryKey: ['fittings', scope],
    queryFn: async (): Promise<FittingList> => {
      if (scope === 'personal') {
        const { data } = unwrap(await api.GET('/fittings'))
        return { fittings: data, enabled: true, canView: true, canManage: true, corporationName: null }
      }
      const { data } = unwrap(await api.GET('/corporation/fittings'))
      return {
        fittings: data.fittings,
        enabled: data.enabled,
        canView: data.can_view,
        canManage: data.can_manage,
        corporationName: data.corporation_name,
      }
    },
  })
}

/** How pasted EFT text parses, without saving it. */
export function useParseFitting() {
  return useMutation({
    mutationFn: async (eft: string) => unwrap(await api.POST('/fittings/parse', { body: { eft } })).data,
  })
}

export function useSaveFitting(scope: FittingScope) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: components['schemas']['StoreFittingRequest']) =>
      scope === 'personal'
        ? unwrap(await api.POST('/fittings', { body: input })).data
        : unwrap(await api.POST('/corporation/fittings', { body: input })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: ['fittings', scope] }),
  })
}

export function useDeleteFitting(scope: FittingScope) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { response, error } =
        scope === 'personal'
          ? await api.DELETE('/fittings/{fitting}', { params: { path: { fitting: id } } })
          : await api.DELETE('/corporation/fittings/{fitting}', { params: { path: { fitting: id } } })
      if (!response.ok) throw new ApiError(response.status, error as ApiErrorBody | undefined)
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['fittings', scope] }),
  })
}

/**
 * What it takes to fit the chosen ships from the scope's own stock. Runs once
 * at least one fitting is selected, and keeps the previous table while the
 * next one loads.
 */
export function useFittingPlan(scope: FittingScope, options: PlanOptions) {
  return useQuery({
    queryKey: ['fitting-plan', scope, options],
    enabled: options.selections.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const body = { ...options, location_ids: options.location_ids.length > 0 ? options.location_ids : undefined }
      if (scope === 'personal') {
        const result = unwrap(await api.POST('/fitting-program/plan', { body }))
        return { plan: result.data, meta: result.meta, characterName: null as string | null }
      }
      const result = unwrap(await api.POST('/corporation/fitting-program/plan', { body }))
      return { plan: result.data.plan, meta: result.meta, characterName: result.data.character_name }
    },
  })
}

export type BuildProgramInput = PlanOptions & {
  name: string
  /** Build only these missing items; omitted builds every missing item that has a blueprint. */
  type_ids?: number[]
  me?: number
}

/** Turn the shortfall into a (personal or corporate) build program; resolves to its id. */
export function useCreateFittingBuildProgram(scope: FittingScope) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: BuildProgramInput): Promise<number> => {
      const body = { ...input, location_ids: input.location_ids.length > 0 ? input.location_ids : undefined }
      return scope === 'personal'
        ? unwrap(await api.POST('/fitting-program/build-program', { body })).data.id
        : unwrap(await api.POST('/corporation/fitting-program/build-program', { body })).data.id
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['build-programs'] })
      void client.invalidateQueries({ queryKey: ['corp', 'build-programs'] })
    },
  })
}
