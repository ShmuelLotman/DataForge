import { NextResponse } from 'next/server'
import { executeDatasetQuery, getDataset, getDatasets } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'
import type {
  BlendMode,
  NormalizationMode,
  ChartFilter,
} from '@dataforge/types'

// ============================================
// REQUEST TYPES
// ============================================

interface YAxisConfig {
  column: string
  agg?: string
}

interface XAxisConfig {
  column: string
  bucket?: string
  derived?: string
  sourceColumn?: string
}

interface GroupByConfig {
  column: string
  derived?: string
  sourceColumn?: string
}

interface QueryConfig {
  x: XAxisConfig
  y: YAxisConfig[]
  groupBy?: GroupByConfig[]
  filters?: ChartFilter[]
  blendMode: BlendMode
  normalizeTo?: NormalizationMode
  limit?: number
  sortBy?: {
    column: string
    direction: 'asc' | 'desc'
  }
  // KPI mode: aggregate all data into a single row without grouping
  aggregateOnly?: boolean
}

interface BlendedRequestBody {
  datasetIds: string[]
  config: QueryConfig
}

// ============================================
// HELPERS
// ============================================

type DataRow = Record<string, string | number | null>

/**
 * Creates a unique key for grouping/merging rows
 */
function makeRowKey(
  row: DataRow,
  xColumn: string,
  groupByColumns: string[]
): string {
  const parts = [String(row[xColumn] ?? '')]
  for (const col of groupByColumns) {
    parts.push(String(row[col] ?? ''))
  }
  return parts.join('|')
}

/**
 * Aggregate mode: Merge rows by key, summing metric columns
 */
function aggregateRows(
  allRows: DataRow[],
  xColumn: string,
  metricColumns: string[],
  groupByColumns: string[]
): DataRow[] {
  const merged = new Map<string, DataRow>()

  for (const row of allRows) {
    const key = makeRowKey(row, xColumn, groupByColumns)
    const existing = merged.get(key)

    if (!existing) {
      // Clone row with just the dimension columns
      const newRow: DataRow = { [xColumn]: row[xColumn] }
      for (const col of groupByColumns) {
        newRow[col] = row[col]
      }
      for (const col of metricColumns) {
        newRow[col] = Number(row[col] ?? 0)
      }
      merged.set(key, newRow)
    } else {
      // Sum metrics into existing row
      for (const col of metricColumns) {
        const current = Number(existing[col] ?? 0)
        const incoming = Number(row[col] ?? 0)
        existing[col] = current + (isNaN(incoming) ? 0 : incoming)
      }
    }
  }

  return Array.from(merged.values())
}

/**
 * Separate mode: Keep all rows, add _source column with dataset name
 */
function separateRows(
  rowsByDataset: { datasetName: string; rows: DataRow[] }[]
): DataRow[] {
  const result: DataRow[] = []
  for (const { datasetName, rows } of rowsByDataset) {
    for (const row of rows) {
      result.push({
        ...row,
        _source: datasetName,
      })
    }
  }
  return result
}

/**
 * Apply normalization to rows
 */
function normalizeRows(
  rows: DataRow[],
  metricColumns: string[],
  mode: NormalizationMode
): DataRow[] {
  if (mode === 'none' || !mode) return rows

  if (mode === 'row') {
    // Each row's metrics sum to 100%
    return rows.map((row) => {
      const sum = metricColumns.reduce(
        (acc, col) => acc + Number(row[col] ?? 0),
        0
      )
      if (!sum) return row
      const normalized: DataRow = { ...row }
      for (const col of metricColumns) {
        normalized[col] = (Number(row[col] ?? 0) / sum) * 100
      }
      return normalized
    })
  }

  if (mode === 'all') {
    // All values across all rows sum to 100%
    const grandTotal = rows.reduce((acc, row) => {
      return (
        acc +
        metricColumns.reduce((inner, col) => inner + Number(row[col] ?? 0), 0)
      )
    }, 0)

    if (!grandTotal) return rows

    return rows.map((row) => {
      const normalized: DataRow = { ...row }
      for (const col of metricColumns) {
        normalized[col] = (Number(row[col] ?? 0) / grandTotal) * 100
      }
      return normalized
    })
  }

  return rows
}

/**
 * Apply sorting to rows
 */
function sortRows(
  rows: DataRow[],
  sortBy: { column: string; direction: 'asc' | 'desc' } | undefined
): DataRow[] {
  if (!sortBy) return rows

  const { column, direction } = sortBy
  return [...rows].sort((a, b) => {
    const aVal = Number(a[column] ?? 0)
    const bVal = Number(b[column] ?? 0)
    return direction === 'asc' ? aVal - bVal : bVal - aVal
  })
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: Request) {
  try {
    const session = await requireAuth()
    const body = (await request.json()) as BlendedRequestBody

    // Validation
    if (!body.datasetIds || body.datasetIds.length === 0) {
      return NextResponse.json(
        { error: 'datasetIds are required' },
        { status: 400 }
      )
    }

    if (!body.config?.x || !body.config?.y?.length) {
      return NextResponse.json(
        { error: 'Missing required parameters: x and y configuration' },
        { status: 400 }
      )
    }

    // Validate dataset ownership and get dataset info
    const allDatasets = await getDatasets(session.user.id)
    const datasetMap = new Map(allDatasets.map((d) => [d.id, d]))

    const datasets = body.datasetIds.map((id) => {
      const ds = datasetMap.get(id)
      if (!ds) throw new Error(`Dataset ${id} not found`)
      return ds
    })

    // Check if this is KPI/aggregateOnly mode
    // Also detect legacy KPI panels that used '_kpi' as x-axis
    const isAggregateOnly =
      body.config.aggregateOnly === true ||
      body.config.x?.column === '_kpi' ||
      body.config.x?.column === '_unused'

    // Validate that all required columns exist in all datasets
    // For derived columns, check the sourceColumn instead of the derived name
    const requiredColumns = new Set<string>()

    // X-axis: skip for aggregateOnly mode (KPI doesn't need x-axis)
    // Also skip _source (it's a synthetic virtual column)
    if (!isAggregateOnly && body.config.x.column !== '_source') {
      if (body.config.x.derived && body.config.x.sourceColumn) {
        requiredColumns.add(body.config.x.sourceColumn)
      } else {
        requiredColumns.add(body.config.x.column)
      }
    }

    // Y-axis columns (always required)
    for (const y of body.config.y) {
      requiredColumns.add(y.column)
    }

    // GroupBy columns: skip for aggregateOnly mode, skip _source (synthetic)
    if (!isAggregateOnly && body.config.groupBy) {
      for (const g of body.config.groupBy) {
        if (g.column === '_source') continue // Skip synthetic column
        if (g.derived && g.sourceColumn) {
          requiredColumns.add(g.sourceColumn)
        } else {
          requiredColumns.add(g.column)
        }
      }
    }

    for (const ds of datasets) {
      const schema = ds.canonicalSchema || []
      const schemaColumnIds = new Set(schema.map((c) => c.id))
      for (const col of requiredColumns) {
        if (!schemaColumnIds.has(col)) {
          return NextResponse.json(
            {
              error: `Column "${col}" is missing in dataset "${ds.name}"`,
            },
            { status: 400 }
          )
        }
      }
    }

    // Execute query for each dataset
    // Filter out _source from groupBy (it's added after query execution)
    const groupByWithoutSource = (body.config.groupBy || []).filter(
      (g) => g.column !== '_source'
    )
    const xIsSource = body.config.x.column === '_source'
    const queryConfig = {
      x: xIsSource ? { column: '_unused' } : body.config.x,
      y: body.config.y,
      groupBy: isAggregateOnly ? [] : groupByWithoutSource,
      filters: body.config.filters || [],
      // Don't pass limit/sortBy to individual queries - we apply after blending
      // Pass aggregateOnly for KPI mode OR when x-axis is _source (aggregate entire dataset)
      ...((isAggregateOnly || xIsSource) && { aggregateOnly: true }),
    }

    const queryResults = await Promise.all(
      datasets.map(async (ds) => ({
        datasetName: ds.name,
        rows: (await executeDatasetQuery(ds.id, queryConfig)) as DataRow[],
      }))
    )

    // Extract config values
    // For derived columns, the SQL function returns the data keyed by the derived column name
    // (which is set as x.column when using derived columns)
    const xColumn = body.config.x.column
    const metricColumns = body.config.y.map((y) => y.column)
    // Check if _source is used as x-axis or in groupBy
    const groupByHasSource = (body.config.groupBy || []).some(
      (g) => g.column === '_source'
    )
    const usesSource = xIsSource || groupByHasSource
    // Get non-_source groupBy columns from config
    const configGroupBy = isAggregateOnly
      ? []
      : (body.config.groupBy || [])
          .map((g) => g.column)
          .filter((c) => c !== '_source')
    // Build effective groupBy: include _source if used (but not as x-axis to avoid duplication)
    const groupByColumns =
      usesSource && !xIsSource ? ['_source', ...configGroupBy] : configGroupBy
    const blendMode = body.config.blendMode || 'aggregate'
    const normalizeTo = body.config.normalizeTo || 'none'

    // Blend rows based on mode
    let blendedRows: DataRow[]

    if (isAggregateOnly && !xIsSource) {
      // KPI mode: sum all metrics from all datasets into a single row
      const result: DataRow = {}
      for (const col of metricColumns) {
        result[col] = 0
      }

      for (const { rows } of queryResults) {
        for (const row of rows) {
          for (const col of metricColumns) {
            const current = Number(result[col] ?? 0)
            const incoming = Number(row[col] ?? 0)
            result[col] = current + (isNaN(incoming) ? 0 : incoming)
          }
        }
      }

      blendedRows = [result]
    } else if (xIsSource) {
      // X-axis is _source: create one row per dataset
      // Each dataset query returned aggregated totals (aggregateOnly mode)
      blendedRows = queryResults.map(({ datasetName, rows }) => {
        const result: DataRow = { _source: datasetName }
        // Initialize metrics to 0
        for (const col of metricColumns) {
          result[col] = 0
        }
        // Sum all rows from this dataset (should be 1 row from aggregateOnly query)
        // If no rows returned, result will have all zeros (which is correct)
        for (const row of rows) {
          for (const col of metricColumns) {
            const current = Number(result[col] ?? 0)
            // Check if the metric exists in the row - it might be null or undefined
            const rowValue = row[col]
            const incoming =
              rowValue !== null && rowValue !== undefined ? Number(rowValue) : 0
            result[col] = current + (isNaN(incoming) ? 0 : incoming)
          }
        }

        return result
      })
    } else {
      // Step 1: Always tag all rows with _source (dataset name)
      const allRowsWithSource = queryResults.flatMap(({ datasetName, rows }) =>
        rows.map((row) => ({ ...row, _source: datasetName }))
      )

      // Step 2: Determine effective x-axis column
      const effectiveXColumn = xColumn

      // Step 3: Apply aggregation or keep separate based on blend mode
      if (blendMode === 'separate' && !usesSource) {
        // Separate mode without _source grouping: keep all rows as-is
        blendedRows = allRowsWithSource
      } else {
        // Aggregate mode OR using _source: merge rows by key
        blendedRows = aggregateRows(
          allRowsWithSource,
          effectiveXColumn,
          metricColumns,
          groupByColumns
        )
      }
    }

    // Apply normalization (skip for KPI - single value doesn't need normalization)
    // For aggregateBySource, normalization makes sense (shows % of total per dataset)
    if (!isAggregateOnly) {
      blendedRows = normalizeRows(blendedRows, metricColumns, normalizeTo)
    }

    // Apply sorting (skip for KPI - single row)
    if (!isAggregateOnly) {
      blendedRows = sortRows(blendedRows, body.config.sortBy)
    }

    // Apply limit (skip for KPI - already single row)
    if (!isAggregateOnly && body.config.limit && body.config.limit > 0) {
      blendedRows = blendedRows.slice(0, body.config.limit)
    }

    return NextResponse.json(blendedRows)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}
