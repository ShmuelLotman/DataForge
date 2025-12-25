import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import axios, { AxiosError } from 'axios'
import { queryKeys } from '../keys'
import type {
  ChartConfig,
  ChartFilter,
  AggregationType,
  DerivedColumnType,
  BlendMode,
  NormalizationMode,
} from '@dataforge/types'

// Re-export DerivedColumnType for backwards compatibility
export type { DerivedColumnType }

// ============================================
// TYPES
// ============================================

export interface DerivedColumn {
  derived: DerivedColumnType
  sourceColumn: string // The date column to derive from
}

export interface ChartQueryConfig {
  x: {
    column: string
    derived?: DerivedColumnType // Optional: compute derived value
    sourceColumn?: string // Required if derived is set
  }
  y: {
    column: string
    aggregation?: AggregationType
  }[]
  groupBy?:
    | string
    | {
        column: string
        derived?: DerivedColumnType
        sourceColumn?: string
      }
  bucket?: 'day' | 'week' | 'month'
  filters?: ChartFilter[]
  dateRange?: {
    start: string
    end: string
  }
  // Top N / Sorting options
  limit?: number // e.g., 10 for "Top 10"
  sortBy?: {
    column: string // Which metric to sort by
    direction: 'asc' | 'desc' // desc for "top", asc for "bottom"
  }
  // KPI mode: aggregate all data into a single row without grouping
  aggregateOnly?: boolean
  // Request server-side chart transformation (pivot, date formatting)
  transformForChart?: boolean
}

export interface ChartDataPoint {
  /** X-axis value (raw format from single-dataset queries) */
  x?: string | number
  /** X-axis value (Recharts format from transformed queries) */
  name?: string
  [key: string]: string | number | null | undefined
}

/** Response from server-side transformed chart data */
export interface TransformedChartResponse {
  data: Array<{ name: string; [key: string]: string | number }>
  meta: {
    transformed: boolean
    originalRowCount: number
    sampledRowCount: number
    xAxisIsDate: boolean
    dataKeys: string[]
  }
}

/** Check if response is transformed format */
function isTransformedResponse(
  response: unknown
): response is TransformedChartResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    'meta' in response &&
    typeof (response as TransformedChartResponse).meta?.transformed ===
      'boolean'
  )
}

// ============================================
// HELPERS
// ============================================

/**
 * Convert ChartConfig to query API format
 *
 * @param config - Chart configuration
 * @param options - Additional options for the query
 */
export function chartConfigToQueryConfig(
  config: ChartConfig,
  options?: { transformForChart?: boolean }
): ChartQueryConfig {
  if (!config) return { x: { column: '_unused' }, y: [] }
  // KPI charts use aggregateOnly mode - no grouping, just total aggregation
  const isKpi = config.chartType === 'kpi'

  // Build x-axis config with optional derived column
  // For KPI, x-axis is ignored by the backend when aggregateOnly is true
  const xConfig: ChartQueryConfig['x'] = { column: config.xAxis || '_unused' }

  if (!isKpi && config.xAxisDerived && config.xAxisSourceColumn) {
    xConfig.derived = config.xAxisDerived
    xConfig.sourceColumn = config.xAxisSourceColumn
  }

  return {
    x: xConfig,
    y: config?.yAxis?.map((col) => ({
      column: col,
      aggregation: config.aggregation ?? (isKpi ? 'sum' : undefined),
    })),
    groupBy: isKpi ? undefined : config.groupBy ?? undefined,
    bucket: isKpi ? undefined : config.bucket ?? undefined,
    filters: config.filters,
    dateRange: config.dateRange ?? undefined,
    limit: config.limit,
    sortBy: isKpi ? undefined : config.sortBy,
    // KPI mode: aggregate all data into a single row
    aggregateOnly: isKpi ? true : undefined,
    // Server-side chart transformation (default to true for non-KPI charts)
    transformForChart: options?.transformForChart ?? !isKpi,
  }
}

// ============================================
// QUERIES
// ============================================

/**
 * Execute a chart data query against a dataset
 *
 * Server-side transformation is enabled by default for non-KPI charts.
 * The server will pivot, aggregate, and format data for Recharts.
 *
 * @example
 * ```tsx
 * // Basic usage - server transforms data automatically
 * const { data, isLoading, error } = useChartDataQuery(datasetId, {
 *   x: { column: 'date' },
 *   y: [{ column: 'revenue', aggregation: 'sum' }],
 *   bucket: 'month',
 *   transformForChart: true
 * })
 *
 * // Using ChartConfig (transformation enabled by default)
 * const queryConfig = chartConfigToQueryConfig(panelConfig)
 * const { data } = useChartDataQuery(datasetId, queryConfig)
 * ```
 */
export function useChartDataQuery(
  datasetId: string,
  config: ChartQueryConfig,
  options?: Omit<
    UseQueryOptions<ChartDataPoint[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.chartData.query(datasetId, config),
    queryFn: async () => {
      // Build x-axis config with derived column support
      const xConfig: Record<string, string | undefined> = {
        column: config.x.column,
        bucket: config.bucket,
      }
      if (config.x.derived && config.x.sourceColumn) {
        xConfig.derived = config.x.derived
        xConfig.sourceColumn = config.x.sourceColumn
      }

      // Build groupBy config with derived column support
      let groupByConfig: Array<Record<string, string>> = []
      if (config.groupBy) {
        if (typeof config.groupBy === 'string') {
          groupByConfig = [{ column: config.groupBy }]
        } else {
          groupByConfig = [
            {
              column: config.groupBy.column,
              ...(config.groupBy.derived && {
                derived: config.groupBy.derived,
              }),
              ...(config.groupBy.sourceColumn && {
                sourceColumn: config.groupBy.sourceColumn,
              }),
            },
          ]
        }
      }

      const apiConfig = {
        x: xConfig,
        y: config.y.map((item) => ({
          column: item.column,
          agg: item.aggregation || 'sum',
        })),
        groupBy: groupByConfig,
        filters: config.filters || [],
        ...(config.limit && { limit: config.limit }),
        ...(config.sortBy && { sortBy: config.sortBy }),
        // Request server-side transformation (default: true)
        transformForChart: config.transformForChart ?? true,
      }

      const { data: response } = await axios.post<
        ChartDataPoint[] | TransformedChartResponse
      >(`/api/datasets/${datasetId}/query`, apiConfig)

      // Handle both transformed and legacy response formats
      if (isTransformedResponse(response)) {
        return response.data as ChartDataPoint[]
      }
      return response
    },
    enabled: !!datasetId && !!config?.x?.column && config?.y?.length > 0,
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}

/**
 * Hook that directly accepts ChartConfig for convenience
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useChartDataFromConfig(datasetId, {
 *   chartType: 'bar',
 *   xAxis: 'category',
 *   yAxis: ['sales'],
 *   aggregation: 'sum'
 * })
 * ```
 */
export function useChartDataFromConfig(
  datasetId: string,
  config: ChartConfig,
  options?: Omit<
    UseQueryOptions<ChartDataPoint[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  const queryConfig = chartConfigToQueryConfig(config)
  return useChartDataQuery(datasetId, queryConfig, options)
}

// ============================================
// BLENDED (MULTI-DATASET) QUERIES
// ============================================

/**
 * Configuration for blended multi-dataset queries
 */
export interface BlendedQueryConfig extends ChartQueryConfig {
  /** How to blend data from multiple datasets */
  blendMode: BlendMode
  /** Normalize values to percentages */
  normalizeTo?: NormalizationMode
  /** Request server-side chart transformation (pivot, date formatting) */
  transformForChart?: boolean
}

/**
 * Build blended query config from ChartConfig with multi-dataset settings
 */
export function chartConfigToBlendedConfig(
  config: ChartConfig,
  options?: { transformForChart?: boolean }
): BlendedQueryConfig {
  return {
    ...chartConfigToQueryConfig(config),
    blendMode: config?.blendMode ?? 'aggregate',
    normalizeTo: config?.normalizeTo,
    transformForChart: options?.transformForChart ?? true, // Default to server-side transformation
  }
}

/**
 * Execute a blended chart data query across multiple datasets
 *
 * @param datasetIds - Array of dataset IDs to query (primary first)
 * @param config - Query configuration with blend settings
 *
 * @example
 * ```tsx
 * // Aggregate mode: sum sales across all stores
 * const { data } = useBlendedChartDataQuery(
 *   ['store-a-id', 'store-b-id'],
 *   {
 *     x: { column: 'date' },
 *     y: [{ column: 'sales', aggregation: 'sum' }],
 *     blendMode: 'aggregate',
 *   }
 * )
 *
 * // Separate mode: breakdown by store (adds _source column)
 * const { data } = useBlendedChartDataQuery(
 *   ['store-a-id', 'store-b-id'],
 *   {
 *     x: { column: 'product' },
 *     y: [{ column: 'sales', aggregation: 'sum' }],
 *     blendMode: 'separate',
 *   }
 * )
 * ```
 */
export function useBlendedChartDataQuery(
  datasetIds: string[],
  config: BlendedQueryConfig,
  options?: Omit<
    UseQueryOptions<ChartDataPoint[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: queryKeys.chartData.blended(datasetIds, config),
    queryFn: async () => {
      // Build x-axis config
      const xConfig: Record<string, string | undefined> = {
        column: config.x.column,
        bucket: config.bucket,
      }
      if (config.x.derived && config.x.sourceColumn) {
        xConfig.derived = config.x.derived
        xConfig.sourceColumn = config.x.sourceColumn
      }

      // Build groupBy config
      let groupByConfig: Array<Record<string, string>> = []
      if (config.groupBy) {
        if (typeof config.groupBy === 'string') {
          groupByConfig = [{ column: config.groupBy }]
        } else {
          groupByConfig = [
            {
              column: config.groupBy.column,
              ...(config.groupBy.derived && {
                derived: config.groupBy.derived,
              }),
              ...(config.groupBy.sourceColumn && {
                sourceColumn: config.groupBy.sourceColumn,
              }),
            },
          ]
        }
      }

      const apiConfig = {
        datasetIds,
        config: {
          x: xConfig,
          y: config.y.map((item) => ({
            column: item.column,
            agg: item.aggregation || 'sum',
          })),
          groupBy: groupByConfig,
          filters: config.filters || [],
          blendMode: config.blendMode,
          normalizeTo: config.normalizeTo,
          ...(config.limit && { limit: config.limit }),
          ...(config.sortBy && { sortBy: config.sortBy }),
          // Request server-side chart transformation
          transformForChart: config.transformForChart ?? true,
        },
      }

      const { data: response } = await axios.post<
        ChartDataPoint[] | TransformedChartResponse
      >('/api/datasets/query-blended', apiConfig)

      // Handle both transformed and legacy response formats
      if (isTransformedResponse(response)) {
        // Server returned pre-processed chart data
        return response.data as ChartDataPoint[]
      }
      // Legacy format: raw data rows
      return response
    },
    enabled:
      datasetIds.length > 0 && !!config?.x?.column && config?.y?.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Smart hook that automatically chooses between single and blended queries
 * based on the number of datasets in the config
 *
 * @example
 * ```tsx
 * // Will use single-dataset query
 * const { data } = usePanelChartData('dataset-id', config)
 *
 * // Will use blended query if config.datasetIds has multiple entries
 * const { data } = usePanelChartData('primary-id', configWithMultipleDatasets)
 * ```
 */
export function usePanelChartData(
  primaryDatasetId: string,
  config: ChartConfig,
  options?: Omit<
    UseQueryOptions<ChartDataPoint[], AxiosError>,
    'queryKey' | 'queryFn'
  >
) {
  const datasetIds = config?.datasetIds ?? [primaryDatasetId]
  const isMultiDataset = datasetIds.length > 1

  // Single dataset query
  const singleQuery = useChartDataQuery(
    primaryDatasetId,
    chartConfigToQueryConfig(config ?? ({} as any)),
    {
      ...options,
      enabled: !isMultiDataset && (options?.enabled ?? true),
    }
  )

  // Blended query for multiple datasets
  const blendedQuery = useBlendedChartDataQuery(
    datasetIds,
    chartConfigToBlendedConfig(config),
    {
      ...options,
      enabled: isMultiDataset && (options?.enabled ?? true),
    }
  )

  // Return the appropriate query result
  return isMultiDataset ? blendedQuery : singleQuery
}
