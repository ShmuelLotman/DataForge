import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import axios, { AxiosError } from 'axios'
import { queryKeys } from '../keys'
import type {
  ChartConfig,
  ChartFilter,
  AggregationType,
} from '@dataforge/types'

// ============================================
// TYPES
// ============================================

// Derived column types that can be computed from date columns at query time
export type DerivedColumnType =
  | 'day_of_week' // 0-6 (Sunday=0)
  | 'day_of_week_name' // Monday, Tuesday, etc.
  | 'day_of_week_short' // Mon, Tue, etc.
  | 'month' // 1-12
  | 'month_name' // January, February, etc.
  | 'month_short' // Jan, Feb, etc.
  | 'quarter' // 1-4
  | 'quarter_label' // Q1, Q2, Q3, Q4
  | 'year' // 4-digit year
  | 'week_of_year' // 1-53
  | 'day_of_month' // 1-31
  | 'hour' // 0-23
  | 'date_only' // strips time component
  | 'year_month' // YYYY-MM format

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
