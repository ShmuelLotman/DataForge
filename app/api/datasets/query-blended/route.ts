import { NextResponse } from 'next/server'
import { executeDatasetQuery, getDataset, getDatasets } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'
import type { BlendMode, NormalizationMode, ChartFilter } from '@dataforge/types'

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

    // Validate that all required columns exist in all datasets
    // For derived columns, check the sourceColumn instead of the derived name
    const requiredColumns = new Set<string>()
    
    // X-axis: use sourceColumn if derived, otherwise use column
    if (body.config.x.derived && body.config.x.sourceColumn) {
      requiredColumns.add(body.config.x.sourceColumn)
    } else {
      requiredColumns.add(body.config.x.column)
    }
    
    // Y-axis columns
    for (const y of body.config.y) {
      requiredColumns.add(y.column)
    }
    
    // GroupBy columns: use sourceColumn if derived
    if (body.config.groupBy) {
      for (const g of body.config.groupBy) {
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
    const queryConfig = {
      x: body.config.x,
      y: body.config.y,
      groupBy: body.config.groupBy || [],
      filters: body.config.filters || [],
      // Don't pass limit/sortBy to individual queries - we apply after blending
    }

    const queryResults = await Promise.all(
      datasets.map(async (ds) => ({
        datasetName: ds.name,
        rows: (await executeDatasetQuery(ds.id, queryConfig)) as DataRow[],
      }))
    )

    // Debug logging for groupBy issues
    console.log('[Blended Query] Config:', {
      xColumn: body.config.x.column,
      yColumns: body.config.y.map((y) => y.column),
      groupBy: body.config.groupBy,
      blendMode: body.config.blendMode,
    })
    
    // Log schema info for datasets with 0 rows to help debug
    for (let i = 0; i < datasets.length; i++) {
      const ds = datasets[i]
      const result = queryResults[i]
      if (result.rows.length === 0 && ds.rowCount > 0) {
        const schema = ds.canonicalSchema || []
        console.log(`[Blended Query] WARNING: Dataset "${ds.name}" returned 0 rows`, {
          datasetId: ds.id,
          schemaColumns: schema.map((c) => c.id),
          requestedColumns: {
            x: body.config.x.column,
            y: body.config.y.map((y) => y.column),
            groupBy: (body.config.groupBy || []).map((g) => g.column),
          },
          rowCountInDb: ds.rowCount,
        })
        
        // Direct count check - is the data actually there?
        const { supabase } = await import('@/lib/supabase')
        const { count, error } = await supabase
          .from('data_rows')
          .select('*', { count: 'exact', head: true })
          .eq('dataset_id', ds.id)
        console.log(`[Blended Query] Direct count for "${ds.name}":`, { count, error })
        
        // Check a sample row to see actual data structure
        const { data: sampleRow, error: sampleError } = await supabase
          .from('data_rows')
          .select('data')
          .eq('dataset_id', ds.id)
          .limit(1)
          .single()
        console.log(`[Blended Query] Sample row data for "${ds.name}":`, {
          sampleData: sampleRow?.data,
          sampleError,
          hasXColumn: sampleRow?.data?.[body.config.x.column] !== undefined,
          hasYColumn: sampleRow?.data?.[body.config.y[0]?.column] !== undefined,
          xValue: sampleRow?.data?.[body.config.x.column],
          yValue: sampleRow?.data?.[body.config.y[0]?.column],
        })
      }
    }
    
    console.log('[Blended Query] Results sample:', {
      datasetsQueried: queryResults.map((r) => r.datasetName),
      rowCounts: queryResults.map((r) => r.rows.length),
      sampleRows: queryResults.map((r) => r.rows[0]),
    })

    // Extract config values
    // For derived columns, the SQL function returns the data keyed by the derived column name
    // (which is set as x.column when using derived columns)
    const xColumn = body.config.x.column
    const metricColumns = body.config.y.map((y) => y.column)
    // For groupBy, use the column name (which may be the derived name)
    const groupByColumns = (body.config.groupBy || []).map((g) => g.column)
    const blendMode = body.config.blendMode || 'aggregate'
    const normalizeTo = body.config.normalizeTo || 'none'

    // Blend rows based on mode
    let blendedRows: DataRow[]

    if (blendMode === 'separate') {
      // Keep rows separate, add _source column
      blendedRows = separateRows(queryResults)
    } else {
      // Aggregate: merge all rows into one collection, then merge by key
      const allRows = queryResults.flatMap((r) => r.rows)
      blendedRows = aggregateRows(allRows, xColumn, metricColumns, groupByColumns)
    }

    // Apply normalization
    blendedRows = normalizeRows(blendedRows, metricColumns, normalizeTo)

    // Apply sorting
    blendedRows = sortRows(blendedRows, body.config.sortBy)

    // Apply limit
    if (body.config.limit && body.config.limit > 0) {
      blendedRows = blendedRows.slice(0, body.config.limit)
    }

    // Debug: Final result
    console.log('[Blended Query] Final result:', {
      totalRows: blendedRows.length,
      sampleRows: blendedRows.slice(0, 3),
      uniqueSources: [...new Set(blendedRows.map((r) => r._source))],
    })

    return NextResponse.json(blendedRows)
  } catch (error) {
    console.error('Blended query error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}
