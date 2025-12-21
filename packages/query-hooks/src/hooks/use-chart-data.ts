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
}

export interface ChartDataPoint {
  x: string | number
  [key: string]: string | number | null
}

// ============================================
// HELPERS
// ============================================

/**
 * Convert ChartConfig to query API format
 */
export function chartConfigToQueryConfig(
  config: ChartConfig
): ChartQueryConfig {
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
    y: config.yAxis.map((col) => ({
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
  }
}

// ============================================
// QUERIES
// ============================================

/**
 * Execute a chart data query against a dataset
 *
 * @example
 * ```tsx
 * // Basic usage
 * const { data, isLoading, error } = useChartDataQuery(datasetId, {
 *   x: { column: 'date' },
 *   y: [{ column: 'revenue', aggregation: 'sum' }],
 *   bucket: 'month'
 * })
 *
 * // Using ChartConfig
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
      // Transform config to match SQL function's expected format
      // SQL expects: groupBy: [{ column: "name", derived?: "...", sourceColumn?: "..." }]

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
        // Top N / Sorting options
        ...(config.limit && { limit: config.limit }),
        ...(config.sortBy && { sortBy: config.sortBy }),
      }

      const { data } = await axios.post<ChartDataPoint[]>(
        `/api/datasets/${datasetId}/query`,
        apiConfig
      )
      return data
    },
    enabled: !!datasetId && !!config?.x?.column && config?.y?.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
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
}

/**
 * Build blended query config from ChartConfig with multi-dataset settings
 */
export function chartConfigToBlendedConfig(
  config: ChartConfig
): BlendedQueryConfig {
  return {
    ...chartConfigToQueryConfig(config),
    blendMode: config.blendMode ?? 'aggregate',
    normalizeTo: config.normalizeTo,
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
        },
      }

      const { data } = await axios.post<ChartDataPoint[]>(
        '/api/datasets/query-blended',
        apiConfig
      )
      return data
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
  const datasetIds = config.datasetIds ?? [primaryDatasetId]
  const isMultiDataset = datasetIds.length > 1

  // Single dataset query
  const singleQuery = useChartDataQuery(
    primaryDatasetId,
    chartConfigToQueryConfig(config),
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
