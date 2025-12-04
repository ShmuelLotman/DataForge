/**
 * @dataforge/query-hooks
 * 
 * TanStack Query hooks for the DataForge application.
 * Provides type-safe, cached data fetching with automatic cache invalidation.
 * 
 * @example
 * ```tsx
 * // 1. Wrap your app with QueryProvider
 * import { QueryProvider } from '@dataforge/query-hooks'
 * 
 * function App({ children }) {
 *   return <QueryProvider>{children}</QueryProvider>
 * }
 * 
 * // 2. Use hooks in your components
 * import { useDatasetsQuery, useCreateDatasetMutation } from '@dataforge/query-hooks'
 * 
 * function DatasetsList() {
 *   const { data: datasets, isLoading } = useDatasetsQuery()
 *   const createDataset = useCreateDatasetMutation()
 *   
 *   // ...
 * }
 * ```
 */

// ============================================
// PROVIDER
// ============================================
export { QueryProvider, createQueryClient } from './client/provider'

// ============================================
// QUERY KEYS
// ============================================
export { queryKeys, type QueryKeys } from './keys'

// ============================================
// DATASET HOOKS
// ============================================
export {
  useDatasetsQuery,
  useDatasetQuery,
  useDatasetSchemaQuery,
  useDatasetFilesQuery,
  useCreateDatasetMutation,
  useUpdateDatasetMutation,
  useDeleteDatasetMutation,
  type CreateDatasetInput,
  type UpdateDatasetInput,
  type DatasetsListFilters,
} from './hooks/use-datasets'

// ============================================
// DASHBOARD HOOKS
// ============================================
export {
  useDashboardsQuery,
  useDashboardQuery,
  useCreateDashboardMutation,
  useUpdateDashboardMutation,
  useDeleteDashboardMutation,
  type CreateDashboardInput,
  type UpdateDashboardInput,
  type DashboardsListFilters,
} from './hooks/use-dashboards'

// ============================================
// PANEL HOOKS
// ============================================
export {
  useAddPanelMutation,
  useUpdatePanelMutation,
  useDeletePanelMutation,
  useReorderPanelsMutation,
  type CreatePanelInput,
  type UpdatePanelInput,
  type DeletePanelInput,
  type ReorderPanelsInput,
} from './hooks/use-panels'

// ============================================
// CHART DATA HOOKS
// ============================================
export {
  useChartDataQuery,
  useChartDataFromConfig,
  chartConfigToQueryConfig,
  type ChartQueryConfig,
  type ChartDataPoint,
} from './hooks/use-chart-data'

// ============================================
// RE-EXPORTS FROM TANSTACK QUERY
// ============================================
export {
  useQueryClient,
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueries,
  useSuspenseQuery,
  QueryClientProvider,
  type QueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
