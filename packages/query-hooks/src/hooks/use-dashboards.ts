import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import axios, { AxiosError } from 'axios'
import { queryKeys } from '../keys'
import type {
  Dashboard,
  DashboardWithPanels,
  DashboardWithDataset,
} from '@dataforge/types'

// ============================================
// TYPES
// ============================================

export interface CreateDashboardInput {
  datasetId: string
  name: string
  description?: string
}

export interface UpdateDashboardInput {
  name?: string
  description?: string
}

export interface DashboardsListFilters {
  search?: string
  datasetId?: string
}

// ============================================
// QUERIES
// ============================================

/**
 * Fetch all dashboards for the current user
 *
 * @example
 * ```tsx
 * const { data: dashboards, isLoading, error } = useDashboardsQuery()
 *
 * // With filters
 * const { data } = useDashboardsQuery({ datasetId: '123' })
 * ```
 */
export function useDashboardsQuery(
  filters?: DashboardsListFilters,
  options?: Omit<
    UseQueryOptions<DashboardWithDataset[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.dashboards.list(filters),
    queryFn: async () => {
      const { data } = await axios.get<DashboardWithDataset[]>(
        '/api/dashboards'
      )
      return data
    },
    ...options,
  })
}

/**
 * Fetch a single dashboard with all its panels
 *
 * @example
 * ```tsx
 * const { data: dashboard, isLoading } = useDashboardQuery(dashboardId)
 *
 * if (dashboard) {
 *   console.log(dashboard.panels) // Panel[] included
 * }
 * ```
 */
export function useDashboardQuery(
  id: string,
  options?: Omit<
    UseQueryOptions<DashboardWithPanels, AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.dashboards.detail(id),
    queryFn: async () => {
      const { data } = await axios.get<DashboardWithPanels>(
        `/api/dashboards/${id}`
      )
      return data
    },
    enabled: !!id,
    ...options,
  })
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new dashboard
 *
 * @example
 * ```tsx
 * const createDashboard = useCreateDashboardMutation()
 *
 * createDashboard.mutate(
 *   { datasetId: '123', name: 'Sales Overview' },
 *   {
 *     onSuccess: (dashboard) => {
 *       toast.success('Dashboard created!')
 *       router.push(`/dashboard/${dashboard.id}`)
 *     }
 *   }
 * )
 * ```
 */
export function useCreateDashboardMutation(
  options?: UseMutationOptions<Dashboard, AxiosError, CreateDashboardInput>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateDashboardInput) => {
      const { data } = await axios.post<Dashboard>('/api/dashboards', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards.lists() })
    },
    ...options,
  })
}

/**
 * Update a dashboard's metadata
 *
 * @example
 * ```tsx
 * const updateDashboard = useUpdateDashboardMutation()
 *
 * updateDashboard.mutate(
 *   { id: dashboardId, data: { name: 'New Dashboard Name' } },
 *   { onSuccess: () => toast.success('Dashboard updated!') }
 * )
 * ```
 */
export function useUpdateDashboardMutation(
  options?: UseMutationOptions<
    Dashboard,
    AxiosError,
    { id: string; data: UpdateDashboardInput }
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data: updateData,
    }: {
      id: string
      data: UpdateDashboardInput
    }) => {
      const { data } = await axios.patch<Dashboard>(
        `/api/dashboards/${id}`,
        updateData
      )
      return data
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        queryKeys.dashboards.detail(variables.id),
        (old: DashboardWithPanels | undefined) =>
          old ? { ...old, ...data } : undefined
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards.lists() })
    },
    ...options,
  })
}

/**
 * Delete a dashboard
 *
 * @example
 * ```tsx
 * const deleteDashboard = useDeleteDashboardMutation()
 *
 * deleteDashboard.mutate(dashboardId, {
 *   onSuccess: () => {
 *     toast.success('Dashboard deleted!')
 *     router.push('/dashboard')
 *   }
 * })
 * ```
 */
export function useDeleteDashboardMutation(
  options?: UseMutationOptions<{ success: boolean }, AxiosError, string>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await axios.delete<{ success: boolean }>(
        `/api/dashboards/${id}`
      )
      return data
    },
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.dashboards.detail(deletedId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards.lists() })
    },
    ...options,
  })
}
