import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import axios, { AxiosError } from 'axios'
import { queryKeys } from '../keys'
import type { ChartConfig } from '@dataforge/types'

// ============================================
// TYPES
// ============================================

export interface ChartQueryConfig {
  x: {
    column: string
  }
  y: {
    column: string
    aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max'
  }[]
  groupBy?: string
  bucket?: 'day' | 'week' | 'month'
  filters?: Array<{
    column: string
    op: 'eq' | 'in' | 'gte' | 'lte'
    value: string | string[]
  }>
  dateRange?: {
    start: string
    end: string
  }
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
  return {
    x: { column: config.xAxis },
    y: config.yAxis.map((col) => ({
      column: col,
      aggregation: config.aggregation,
    })),
    groupBy: config.groupBy ?? undefined,
    bucket: config.bucket ?? undefined,
    filters: config.filters,
    dateRange: config.dateRange ?? undefined,
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
      // SQL expects: groupBy: [{ column: "name" }], y: [{ column: "x", agg: "sum" }]
      const apiConfig = {
        x: {
          column: config.x.column,
          bucket: config.bucket,
        },
        y: config.y.map((item) => ({
          column: item.column,
          agg: item.aggregation || 'sum',
        })),
        groupBy: config.groupBy ? [{ column: config.groupBy }] : [],
        filters: config.filters || [],
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
