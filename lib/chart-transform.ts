/**
 * Arquero-based data transformation utilities for chart rendering
 *
 * This module provides server-side data processing to reduce frontend load:
 * - Pivot/groupby operations for multi-series charts
 * - Row aggregation for blended datasets
 * - Normalization to percentages
 * - Intelligent sampling for large datasets
 */

import * as aq from 'arquero'
import type { ColumnTable } from 'arquero'
import type { BucketType } from '@/lib/types'

// ============================================
// TYPES
// ============================================

export interface TransformConfig {
  xAxis: string
  yAxis: string[]
  groupBy?: string
  bucket?: BucketType
  blendMode?: 'aggregate' | 'separate'
  xAxisIsDate?: boolean
}

export type NormalizationMode = 'row' | 'column' | 'none'

// ============================================
// DATE FORMATTING (server-side)
// ============================================

/**
 * Format a date value based on bucket granularity
 */
function formatDateLabel(value: unknown, bucket?: BucketType): string {
  if (!value) return ''
  const date = new Date(String(value))
  if (isNaN(date.getTime())) return String(value)

  const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC' }

  switch (bucket) {
    case 'month':
      options.month = 'short'
      options.year = 'numeric'
      break
    case 'week':
    case 'day':
    default:
      options.month = 'short'
      options.day = 'numeric'
      break
  }

  return new Intl.DateTimeFormat('en-US', options).format(date)
}

// ============================================
// CHART DATA TRANSFORMATION
// ============================================

/**
 * Transform raw query data into Recharts-ready format using Arquero
 *
 * This replaces the heavy useMemo processing in chart-renderer.tsx
 * by performing pivoting, grouping, and date formatting server-side.
 */
export function transformChartData(
  data: Record<string, unknown>[],
  config: TransformConfig
): Array<{ name: string; [key: string]: string | number }> {
  if (!data.length) return []

  const { xAxis, yAxis, groupBy, bucket, xAxisIsDate } = config

  // Create Arquero table from data
  let table: ColumnTable = aq.from(data)

  // Format dates if x-axis is date type
  if (xAxisIsDate && bucket) {
    table = table.derive({
      [xAxis]: aq.escape((d: Record<string, unknown>) =>
        formatDateLabel(d[xAxis], bucket)
      ),
    })
  }

  // If groupBy specified, pivot the data
  if (groupBy) {
    // Build aggregation spec for each y-axis column
    const aggSpec: Record<string, unknown> = {}
    for (const yCol of yAxis) {
      aggSpec[yCol] = aq.op.sum(yCol)
    }

    table = table.groupby(xAxis).pivot(groupBy, aggSpec)
  } else {
    // No pivot needed, just aggregate per x-value
    const aggSpec: Record<string, unknown> = {}
    for (const yCol of yAxis) {
      aggSpec[yCol] = aq.op.sum(yCol)
    }
    table = table.groupby(xAxis).rollup(aggSpec)
  }

  // Rename x-axis to 'name' for Recharts compatibility
  table = table.rename({ [xAxis]: 'name' })

  return table.objects() as Array<{ name: string; [key: string]: string | number }>
}

// ============================================
// ROW AGGREGATION (for blended queries)
// ============================================

/**
 * Aggregate rows by key, summing metric columns
 *
 * This replaces the manual aggregateRows() function in query-blended/route.ts
 */
export function aggregateRows(
  data: Record<string, unknown>[],
  xColumn: string,
  metricColumns: string[],
  groupByColumns: string[]
): Record<string, unknown>[] {
  if (!data.length) return []

  const groupCols = [xColumn, ...groupByColumns]

  // Build aggregation spec - sum all metric columns
  const aggSpec: Record<string, unknown> = {}
  for (const col of metricColumns) {
    aggSpec[col] = aq.op.sum(col)
  }

  return aq
    .from(data)
    .groupby(groupCols)
    .rollup(aggSpec)
    .objects() as Record<string, unknown>[]
}

// ============================================
// NORMALIZATION
// ============================================

/**
 * Normalize rows to percentages
 *
 * This replaces the manual normalizeRows() function in query-blended/route.ts
 *
 * @param mode - 'row' normalizes each row to 100%, 'column' normalizes each column to 100%
 */
export function normalizeRows(
  data: Record<string, unknown>[],
  metricColumns: string[],
  mode: NormalizationMode
): Record<string, unknown>[] {
  if (mode === 'none' || !data.length) return data

  let table = aq.from(data)

  if (mode === 'row') {
    // Normalize each row so metrics sum to 100%
    table = table.derive(
      Object.fromEntries(
        metricColumns.map((col) => [
          col,
          aq.escape((d: Record<string, unknown>) => {
            const rowSum = metricColumns.reduce(
              (sum, c) => sum + (Number(d[c]) || 0),
              0
            )
            return rowSum ? ((Number(d[col]) || 0) / rowSum) * 100 : 0
          }),
        ])
      )
    )
  } else if (mode === 'column') {
    // Normalize each column so values sum to 100%
    // First calculate column totals
    const totals = table
      .rollup(
        Object.fromEntries(
          metricColumns.map((col) => [`${col}_total`, aq.op.sum(col)])
        )
      )
      .object() as Record<string, number>

    table = table.derive(
      Object.fromEntries(
        metricColumns.map((col) => [
          col,
          aq.escape((d: Record<string, unknown>) => {
            const total = totals[`${col}_total`] || 0
            return total ? ((Number(d[col]) || 0) / total) * 100 : 0
          }),
        ])
      )
    )
  }

  return table.objects() as Record<string, unknown>[]
}

// ============================================
// INTELLIGENT SAMPLING
// ============================================

/**
 * Intelligent sampling that preserves visual integrity
 *
 * Preserves:
 * - First and last points (boundaries)
 * - Min and max points (outliers)
 * - Evenly sampled points in between
 *
 * @param data - Array of data rows
 * @param maxPoints - Maximum number of points to return
 * @param valueColumn - Column to use for finding min/max (optional)
 */
export function intelligentSample<T extends Record<string, unknown>>(
  data: T[],
  maxPoints: number,
  valueColumn?: string
): T[] {
  if (data.length <= maxPoints) return data

  // Always include first and last points
  const result: T[] = [data[0]]
  const usedIndices = new Set<number>([0, data.length - 1])

  // If we have a value column, find and include min/max points
  if (valueColumn && maxPoints >= 4) {
    let minIdx = 0
    let maxIdx = 0
    let minVal = Number(data[0][valueColumn]) || 0
    let maxVal = minVal

    for (let i = 1; i < data.length; i++) {
      const val = Number(data[i][valueColumn]) || 0
      if (val < minVal) {
        minVal = val
        minIdx = i
      }
      if (val > maxVal) {
        maxVal = val
        maxIdx = i
      }
    }

    usedIndices.add(minIdx)
    usedIndices.add(maxIdx)
  }

  // Calculate how many more points we need to sample
  const reservedPoints = usedIndices.size
  const sampleCount = maxPoints - reservedPoints

  if (sampleCount > 0) {
    // Sample evenly between first and last
    const step = (data.length - 1) / (sampleCount + 1)
    for (let i = 1; i <= sampleCount; i++) {
      const index = Math.round(i * step)
      if (!usedIndices.has(index)) {
        usedIndices.add(index)
      }
    }
  }

  // Build result array in original order
  const sortedIndices = Array.from(usedIndices).sort((a, b) => a - b)
  for (const idx of sortedIndices) {
    if (idx !== 0) {
      // First point already added
      result.push(data[idx])
    }
  }

  return result
}

// ============================================
// AUTO-BUCKETING DETECTION
// ============================================

/**
 * Determine if auto-bucketing should be applied based on data characteristics
 *
 * @param dataLength - Number of rows in the result
 * @param xAxisIsDate - Whether the x-axis is a date column
 * @param hasBucket - Whether bucketing is already specified
 * @param dateRange - Optional date range to determine appropriate bucket size
 */
export function shouldAutoBucket(
  dataLength: number,
  xAxisIsDate: boolean,
  hasBucket: boolean,
  dateRange?: { start: string; end: string }
): BucketType | null {
  // Don't auto-bucket if:
  // - Result is small enough
  // - X-axis is not a date
  // - Bucketing is already specified
  if (dataLength <= 2000 || !xAxisIsDate || hasBucket) {
    return null
  }

  // Determine bucket size based on date range
  if (dateRange) {
    const start = new Date(dateRange.start)
    const end = new Date(dateRange.end)
    const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

    if (daysDiff > 365 * 2) {
      return 'month' // More than 2 years → monthly
    } else if (daysDiff > 90) {
      return 'week' // More than 3 months → weekly
    } else {
      return 'day' // Less than 3 months → daily
    }
  }

  // Default to daily if no range info
  return 'day'
}

