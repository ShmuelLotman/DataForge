import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import axios, { AxiosError } from 'axios'
import { queryKeys } from '../keys'
import type {
  DashboardPanelWithDataset,
  ChartConfig,
  DashboardWithPanels,
} from '@dataforge/types'

// ============================================
// TYPES
// ============================================

export interface CreatePanelInput {
  dashboardId: string
  datasetId: string
  title: string
  config: ChartConfig
}

export interface UpdatePanelInput {
  dashboardId: string
  panelId: string
  data: {
    title?: string
    config?: ChartConfig
    datasetId?: string
  }
}

export interface DeletePanelInput {
  dashboardId: string
  panelId: string
}

export interface ReorderPanelsInput {
  dashboardId: string
  panelIds: string[]
}

// ============================================
// MUTATIONS
// ============================================

/**
 * Add a new panel to a dashboard
 *
 * @example
 * ```tsx
 * const addPanel = useAddPanelMutation()
 *
 * addPanel.mutate(
 *   {
 *     dashboardId,
 *     datasetId,
 *     title: 'Monthly Revenue',
 *     config: {
 *       chartType: 'line',
 *       xAxis: 'date',
 *       yAxis: ['revenue'],
 *       aggregation: 'sum',
 *       bucket: 'month'
 *     }
 *   },
 *   { onSuccess: () => toast.success('Panel added!') }
 * )
 * ```
 */
export function useAddPanelMutation(
  options?: UseMutationOptions<
    DashboardPanelWithDataset,
    AxiosError,
    CreatePanelInput
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dashboardId,
      datasetId,
      title,
      config,
    }: CreatePanelInput) => {
      const { data } = await axios.post<DashboardPanelWithDataset>(
        `/api/dashboards/${dashboardId}/panels`,
        { datasetId, title, config }
      )
      return data
    },
    onSuccess: (newPanel, variables, context) => {
      const queryKey = queryKeys.dashboards.detail(variables.dashboardId)

      // 1. Optimistic update for immediate UI feedback
      queryClient.setQueryData<DashboardWithPanels>(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          panels: [...old.panels, newPanel],
        }
      })

      // 2. Invalidate to ensure fresh data from server
      queryClient.invalidateQueries({
        queryKey,
        refetchType: 'active',
      })

      // 3. Call custom onSuccess AFTER cache operations
      options?.onSuccess?.(
        newPanel,
        variables,
        context as any,
        undefined as any
      )
    },
    onError: options?.onError,
    // Spread other options (excluding onSuccess/onError which are handled above)
    ...(options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) => !['onSuccess', 'onError'].includes(key)
          )
        )
      : {}),
  })
}

/**
 * Update a panel's title, config, or dataset
 *
 * @example
 * ```tsx
 * const updatePanel = useUpdatePanelMutation()
 *
 * updatePanel.mutate(
 *   {
 *     dashboardId,
 *     panelId,
 *     data: { title: 'Updated Chart Title' }
 *   },
 *   { onSuccess: () => toast.success('Panel updated!') }
 * )
 * ```
 */
export function useUpdatePanelMutation(
  options?: UseMutationOptions<
    DashboardPanelWithDataset,
    AxiosError,
    UpdatePanelInput
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      dashboardId,
      panelId,
      data: updateData,
    }: UpdatePanelInput) => {
      const { data } = await axios.patch<DashboardPanelWithDataset>(
        `/api/dashboards/${dashboardId}/panels/${panelId}`,
        updateData
      )
      return data
    },
    onSuccess: (updatedPanel, variables, context) => {
      const queryKey = queryKeys.dashboards.detail(variables.dashboardId)

      // Optimistic update
      queryClient.setQueryData(
        queryKey,
        (old: DashboardWithPanels | undefined) => {
          if (!old) return old
          return {
            ...old,
            panels: old.panels.map((p) =>
              p.id === variables.panelId ? updatedPanel : p
            ),
          }
        }
      )

      // Invalidate to ensure fresh data
      queryClient.invalidateQueries({
        queryKey,
        refetchType: 'active',
      })

      // Call custom onSuccess if provided
      options?.onSuccess?.(
        updatedPanel,
        variables,
        context as any,
        undefined as any
      )
    },
    onError: options?.onError,
    // Spread other options (excluding onSuccess/onError)
    ...(options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) => !['onSuccess', 'onError'].includes(key)
          )
        )
      : {}),
  })
}

/**
 * Delete a panel from a dashboard
 *
 * @example
 * ```tsx
 * const deletePanel = useDeletePanelMutation()
 *
 * deletePanel.mutate(
 *   { dashboardId, panelId },
 *   { onSuccess: () => toast.success('Panel removed!') }
 * )
 * ```
 */
export function useDeletePanelMutation(
  options?: UseMutationOptions<
    { success: boolean },
    AxiosError,
    DeletePanelInput,
    { previousDashboard: DashboardWithPanels | undefined }
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ dashboardId, panelId }: DeletePanelInput) => {
      const { data } = await axios.delete<{ success: boolean }>(
        `/api/dashboards/${dashboardId}/panels/${panelId}`
      )
      return data
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.dashboards.detail(variables.dashboardId),
      })

      const previousDashboard = queryClient.getQueryData<DashboardWithPanels>(
        queryKeys.dashboards.detail(variables.dashboardId)
      )

      queryClient.setQueryData(
        queryKeys.dashboards.detail(variables.dashboardId),
        (old: DashboardWithPanels | undefined) => {
          if (!old) return old
          return {
            ...old,
            panels: old.panels.filter((p) => p.id !== variables.panelId),
          }
        }
      )

      return { previousDashboard }
    },
    onError: (_, variables, context) => {
      if (context?.previousDashboard) {
        queryClient.setQueryData(
          queryKeys.dashboards.detail(variables.dashboardId),
          context.previousDashboard
        )
      }
    },
    ...options,
  })
}

/**
 * Reorder panels in a dashboard
 *
 * @example
 * ```tsx
 * const reorderPanels = useReorderPanelsMutation()
 *
 * // After drag-and-drop reordering
 * reorderPanels.mutate(
 *   { dashboardId, panelIds: newOrder },
 *   { onError: () => toast.error('Failed to save order') }
 * )
 * ```
 */
export function useReorderPanelsMutation(
  options?: UseMutationOptions<
    { success: boolean },
    AxiosError,
    ReorderPanelsInput,
    { previousDashboard: DashboardWithPanels | undefined }
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ dashboardId, panelIds }: ReorderPanelsInput) => {
      const { data } = await axios.post<{ success: boolean }>(
        `/api/dashboards/${dashboardId}/panels/reorder`,
        { panelIds }
      )
      return data
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.dashboards.detail(variables.dashboardId),
      })

      const previousDashboard = queryClient.getQueryData<DashboardWithPanels>(
        queryKeys.dashboards.detail(variables.dashboardId)
      )

      queryClient.setQueryData(
        queryKeys.dashboards.detail(variables.dashboardId),
        (old: DashboardWithPanels | undefined) => {
          if (!old) return old

          const panelMap = new Map(old.panels.map((p) => [p.id, p]))

          const reorderedPanels = variables.panelIds
            .map((id, index) => {
              const panel = panelMap.get(id)
              return panel ? { ...panel, sortOrder: index } : null
            })
            .filter((p): p is DashboardPanelWithDataset => p !== null)

          return {
            ...old,
            panels: reorderedPanels,
          }
        }
      )

      return { previousDashboard }
    },
    onError: (_, variables, context) => {
      if (context?.previousDashboard) {
        queryClient.setQueryData(
          queryKeys.dashboards.detail(variables.dashboardId),
          context.previousDashboard
        )
      }
    },
    ...options,
  })
}
