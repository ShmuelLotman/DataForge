import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import axios, { AxiosError } from 'axios'
import { queryKeys } from '../keys'
import type { Dataset, ColumnSchema, DataFile } from '@dataforge/types'

// ============================================
// TYPES
// ============================================

export interface CreateDatasetInput {
  name: string
  description?: string
}

export interface UpdateDatasetInput {
  name?: string
  description?: string
}

export interface DatasetsListFilters {
  search?: string
}

// ============================================
// QUERIES
// ============================================

/**
 * Fetch all datasets for the current user
 *
 * @example
 * ```tsx
 * const { data: datasets, isLoading, error } = useDatasetsQuery()
 *
 * // With search filter
 * const { data } = useDatasetsQuery({ search: 'sales' })
 * ```
 */
export function useDatasetsQuery(
  filters?: DatasetsListFilters,
  options?: Omit<UseQueryOptions<Dataset[], AxiosError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.datasets.list(filters),
    queryFn: async () => {
      const { data } = await axios.get<Dataset[]>('/api/datasets')
      return data
    },
    ...options,
  })
}

/**
 * Fetch a single dataset by ID
 *
 * @example
 * ```tsx
 * const { data: dataset, isLoading } = useDatasetQuery(datasetId)
 *
 * // Only fetch when we have an ID
 * const { data } = useDatasetQuery(datasetId, { enabled: !!datasetId })
 * ```
 */
export function useDatasetQuery(
  id: string,
  options?: Omit<UseQueryOptions<Dataset, AxiosError>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.datasets.detail(id),
    queryFn: async () => {
      const { data } = await axios.get<Dataset>(`/api/datasets/${id}`)
      return data
    },
    enabled: !!id,
    ...options,
  })
}

/**
 * Fetch dataset schema (columns)
 *
 * @example
 * ```tsx
 * const { data: schema } = useDatasetSchemaQuery(datasetId)
 * ```
 */
export function useDatasetSchemaQuery(
  id: string,
  options?: Omit<
    UseQueryOptions<ColumnSchema[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.datasets.schema(id),
    queryFn: async () => {
      const { data } = await axios.get<ColumnSchema[]>(
        `/api/datasets/${id}/schema`
      )
      return data
    },
    enabled: !!id,
    ...options,
  })
}

/**
 * Fetch files associated with a dataset
 *
 * @example
 * ```tsx
 * const { data: files } = useDatasetFilesQuery(datasetId)
 * ```
 */
export function useDatasetFilesQuery(
  id: string,
  options?: Omit<
    UseQueryOptions<DataFile[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.datasets.files(id),
    queryFn: async () => {
      const { data } = await axios.get<DataFile[]>(`/api/datasets/${id}/files`)
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
 * Create a new dataset
 *
 * @example
 * ```tsx
 * const createDataset = useCreateDatasetMutation()
 *
 * // In an event handler
 * createDataset.mutate(
 *   { name: 'Sales Data', description: 'Q4 2024' },
 *   {
 *     onSuccess: (data) => {
 *       toast.success('Dataset created!')
 *       router.push(`/datasets/${data.id}`)
 *     }
 *   }
 * )
 * ```
 */
export function useCreateDatasetMutation(
  options?: Omit<
    UseMutationOptions<Dataset, AxiosError, CreateDatasetInput, unknown>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient()

  return useMutation<Dataset, AxiosError, CreateDatasetInput, unknown>({
    mutationFn: async (input: CreateDatasetInput) => {
      const { data } = await axios.post<Dataset>('/api/datasets', input)
      return data
    },
    ...options,
    onSuccess: async (data, variables, context) => {
      // Always invalidate the datasets list to ensure fresh data
      await queryClient.invalidateQueries({
        queryKey: queryKeys.datasets.lists(),
      })
      // Call user's onSuccess callback if provided
    },
  })
}

/**
 * Update a dataset
 *
 * @example
 * ```tsx
 * const updateDataset = useUpdateDatasetMutation()
 *
 * updateDataset.mutate(
 *   { id: datasetId, data: { name: 'Updated Name' } },
 *   { onSuccess: () => toast.success('Dataset updated!') }
 * )
 * ```
 */
export function useUpdateDatasetMutation(
  options?: UseMutationOptions<
    Dataset,
    AxiosError,
    { id: string; data: UpdateDatasetInput }
  >
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data: updateData,
    }: {
      id: string
      data: UpdateDatasetInput
    }) => {
      const { data } = await axios.patch<Dataset>(
        `/api/datasets/${id}`,
        updateData
      )
      return data
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKeys.datasets.detail(variables.id), data)
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.lists() })
    },
    ...options,
  })
}

/**
 * Delete a dataset
 *
 * @example
 * ```tsx
 * const deleteDataset = useDeleteDatasetMutation()
 *
 * // With optimistic update
 * deleteDataset.mutate(datasetId, {
 *   onSuccess: () => toast.success('Dataset deleted!'),
 *   onError: () => toast.error('Failed to delete dataset')
 * })
 * ```
 */
export function useDeleteDatasetMutation(
  options?: UseMutationOptions<{ success: boolean }, AxiosError, string>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await axios.delete<{ success: boolean }>(
        `/api/datasets/${id}`
      )
      return data
    },
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.datasets.detail(deletedId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards.lists() })
    },
    ...options,
  })
}
