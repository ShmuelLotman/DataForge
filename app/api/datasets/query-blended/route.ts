import { NextResponse } from 'next/server'
import { executeDatasetQuery, getDataset, getDatasets } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'
import type {
  BlendMode,
  NormalizationMode,
  ChartFilter,
} from '@dataforge/types'
import {
  aggregateRows as arqueroAggregateRows,
  normalizeRows as arqueroNormalizeRows,
  transformChartData,
  intelligentSample,
} from '@/lib/chart-transform'
import { isDateString } from '@/lib/date-utils'

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
  // Transform data for chart rendering (pivot, date formatting)
  transformForChart?: boolean
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
 * Aggregate mode: Merge rows by key, summing metric columns
 * Uses Arquero for efficient columnar processing
 */
function aggregateRows(
  allRows: DataRow[],
  xColumn: string,
  metricColumns: string[],
  groupByColumns: string[]
): DataRow[] {
  return arqueroAggregateRows(
    allRows as Record<string, unknown>[],
    xColumn,
    metricColumns,
    groupByColumns
  ) as DataRow[]
}

/**
 * Apply normalization to rows
 * Uses Arquero for efficient columnar processing
 */
function normalizeRows(
  rows: DataRow[],
  metricColumns: string[],
  mode: NormalizationMode
): DataRow[] {
  if (mode === 'none' || !mode) return rows

  // Map 'all' mode to 'column' mode (both normalize across all rows)
  const arqueroMode =
    mode === 'all' ? 'column' : mode === 'row' ? 'row' : 'none'

  return arqueroNormalizeRows(
    rows as Record<string, unknown>[],
    metricColumns,
    arqueroMode
  ) as DataRow[]
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

    // Execute query for each dataset with error handling
    // Use Promise.allSettled to ensure all queries are attempted even if some fail
    const queryResults = await Promise.allSettled(
      datasets.map(async (ds) => {
        try {
          const rows = (await executeDatasetQuery(
            ds.id,
            queryConfig
          )) as DataRow[]
          return {
            datasetName: ds.name,
            datasetId: ds.id,
            rows,
          }
        } catch (error) {
          // Log error but don't fail the entire request
          console.error(`Error querying dataset ${ds.name} (${ds.id}):`, error)
          return {
            datasetName: ds.name,
            datasetId: ds.id,
            rows: [] as DataRow[],
          }
        }
      })
    )

    // Extract successful results and log any failures
    const successfulResults: Array<{
      datasetName: string
      datasetId: string
      rows: DataRow[]
    }> = []

    for (let i = 0; i < queryResults.length; i++) {
      const result = queryResults[i]
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value)
        // Log dataset query results for debugging
        // console.log(
        //   `[Blended Query] Dataset ${result.value.datasetName} (${result.value.datasetId}): ${result.value.rows.length} rows`
        // )
        if (result.value.rows.length > 0) {
          // console.log(
          //   `[Blended Query] Sample row from ${result.value.datasetName}:`,
          //   JSON.stringify(result.value.rows[0], null, 2)
          // )
        }
      } else {
        console.error(
          `Failed to query dataset ${datasets[i].name} (${datasets[i].id}):`,
          result.reason
        )
        // Include empty result so blending logic still works
        successfulResults.push({
          datasetName: datasets[i].name,
          datasetId: datasets[i].id,
          rows: [],
        })
      }
    }

    const totalRowsBeforeBlending = successfulResults.reduce(
      (sum, r) => sum + r.rows.length,
      0
    )
    // console.log(
    //   `[Blended Query] Total rows before blending: ${totalRowsBeforeBlending}`
    // )

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

      for (const { rows } of successfulResults) {
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
      blendedRows = successfulResults.map(({ datasetName, rows }) => {
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
      const allRowsWithSource = successfulResults.flatMap(
        ({ datasetName, rows }) =>
          rows.map((row) => ({ ...row, _source: datasetName }))
      )

      // console.log(
      //   `[Blended Query] Rows after tagging with _source: ${allRowsWithSource.length}`
      // )
      // Count rows by dataset for debugging
      const rowsByDataset = new Map<string, number>()
      for (const row of allRowsWithSource) {
        const source = String(row._source || 'unknown')
        rowsByDataset.set(source, (rowsByDataset.get(source) || 0) + 1)
      }
      // console.log(
      //   `[Blended Query] Rows by dataset:`,
      //   Object.fromEntries(rowsByDataset)
      // )

      // Step 2: Determine effective x-axis column
      const effectiveXColumn = xColumn

      // Step 3: Apply aggregation based on blend mode
      if (blendMode === 'separate') {
        // Separate mode: aggregate by x-axis AND _source to keep datasets distinct
        // This ensures each dataset has one row per x-value, ready for pivoting
        blendedRows = aggregateRows(
          allRowsWithSource,
          effectiveXColumn,
          metricColumns,
          ['_source', ...configGroupBy] // Include _source in groupBy for separate mode
        )
        // console.log(
        //   `[Blended Query] Using separate mode - aggregated to ${blendedRows.length} rows (by x + _source)`
        // )
      } else {
        // Aggregate mode: merge rows by key (merging all datasets together)
        blendedRows = aggregateRows(
          allRowsWithSource,
          effectiveXColumn,
          metricColumns,
          groupByColumns
        )
        // console.log(
        //   `[Blended Query] Using aggregate mode - merged to ${blendedRows.length} rows`
        // )
      }
    }

    // Apply normalization (skip for KPI - single value doesn't need normalization)
    // For aggregateBySource, normalization makes sense (shows % of total per dataset)
    if (!isAggregateOnly) {
      blendedRows = normalizeRows(blendedRows, metricColumns, normalizeTo)
    }

    // Apply sorting (skip for KPI - single row)
    if (!isAggregateOnly) {
      const beforeSort = blendedRows.length
      blendedRows = sortRows(blendedRows, body.config.sortBy)
      // console.log(
      //   `[Blended Query] After sorting: ${blendedRows.length} rows (was ${beforeSort})`
      // )
      // Count rows by dataset after sorting
      const rowsByDatasetAfterSort = new Map<string, number>()
      for (const row of blendedRows) {
        const source = String(row._source || 'unknown')
        rowsByDatasetAfterSort.set(
          source,
          (rowsByDatasetAfterSort.get(source) || 0) + 1
        )
      }
      // console.log(
      //   `[Blended Query] Rows by dataset after sort:`,
      //   Object.fromEntries(rowsByDatasetAfterSort)
      // )
    }

    // Apply limit (skip for KPI - already single row)
    if (!isAggregateOnly && body.config.limit && body.config.limit > 0) {
      // When there's a groupBy column, limit should apply to unique groupBy values
      // (e.g., "top 20 descriptions"), not raw row count
      // This ensures we get all x-axis values for the top N groupBy values
      if (configGroupBy.length > 0) {
        const groupByCol = configGroupBy[0]
        const metricCol = metricColumns[0]

        // Calculate total per groupBy value (sum across all x-values and sources)
        const totalsByGroup = new Map<string, number>()
        for (const row of blendedRows) {
          const groupVal = String(row[groupByCol] ?? 'unknown')
          const metricVal = Number(row[metricCol] ?? 0)
          totalsByGroup.set(
            groupVal,
            (totalsByGroup.get(groupVal) || 0) + metricVal
          )
        }

        // Sort groups by total and take top N
        const sortDirection = body.config.sortBy?.direction ?? 'desc'
        const sortedGroups = Array.from(totalsByGroup.entries()).sort((a, b) =>
          sortDirection === 'desc' ? b[1] - a[1] : a[1] - b[1]
        )
        const topGroups = new Set(
          sortedGroups.slice(0, body.config.limit).map(([group]) => group)
        )

        // Keep only rows for top N groups
        blendedRows = blendedRows.filter((row) =>
          topGroups.has(String(row[groupByCol] ?? 'unknown'))
        )
      } else if (blendMode === 'separate' && !usesSource) {
        // Separate mode without groupBy: ensure balanced representation across datasets
        // Group rows by dataset
        const rowsByDataset = new Map<string, DataRow[]>()
        for (const row of blendedRows) {
          const source = String(row._source || 'unknown')
          if (!rowsByDataset.has(source)) {
            rowsByDataset.set(source, [])
          }
          rowsByDataset.get(source)!.push(row)
        }

        const numDatasets = rowsByDataset.size
        const limitPerDataset = Math.ceil(body.config.limit / numDatasets)

        // Sort each dataset's rows separately and take top N from each
        const limitedRows: DataRow[] = []
        for (const [, rows] of rowsByDataset) {
          // Sort this dataset's rows by the same criteria to get its "best" rows
          const sortedDatasetRows = sortRows(rows, body.config.sortBy)
          limitedRows.push(...sortedDatasetRows.slice(0, limitPerDataset))
        }

        // Re-sort the combined limited rows to maintain global sort order
        blendedRows = sortRows(limitedRows, body.config.sortBy)

        // If we still have more than the limit, trim to exact limit
        if (blendedRows.length > body.config.limit) {
          blendedRows = blendedRows.slice(0, body.config.limit)
        }
      } else {
        // Aggregate mode or using _source: apply global limit
        blendedRows = blendedRows.slice(0, body.config.limit)
      }
    }

    // ============================================
    // SERVER-SIDE CHART TRANSFORMATION
    // ============================================
    // If transformForChart is enabled, pivot and format data for Recharts
    // This moves heavy processing from frontend to server
    if (body.config.transformForChart && !isAggregateOnly) {
      // Detect if x-axis is a date column by checking the first row's value
      const firstXValue = blendedRows[0]?.[xColumn]
      const xAxisIsDate = isDateString(firstXValue)

      // Determine the effective groupBy column for pivoting
      // Priority:
      // 1. When x-axis IS _source (pie chart showing datasets), don't pivot - data is already grouped
      // 2. If user explicitly specified a groupBy column, respect that for pivoting (creates series per groupBy value)
      // 3. If blendMode is 'separate' with multiple datasets (no explicit groupBy), pivot by _source
      // 4. If _source is in groupBy but not x-axis, pivot by _source
      const pivotColumn = xIsSource
        ? undefined // Don't pivot when x-axis is _source (pie charts)
        : configGroupBy.length > 0
        ? configGroupBy[0] // User's explicit groupBy takes priority - pivot by their chosen column
        : blendMode === 'separate' && datasets.length > 1
        ? '_source' // Only pivot by _source when no explicit groupBy in separate mode
        : usesSource
        ? '_source' // Pivot by _source when it's in groupBy but not x-axis
        : undefined

      // Transform data into Recharts-ready format
      // Filter out 'none' bucket value since it's not a valid BucketType
      const bucketValue =
        body.config.x.bucket && body.config.x.bucket !== 'none'
          ? (body.config.x.bucket as 'day' | 'week' | 'month')
          : undefined

      const chartData = transformChartData(
        blendedRows as Record<string, unknown>[],
        {
          xAxis: xColumn,
          yAxis: metricColumns,
          groupBy: pivotColumn,
          bucket: bucketValue,
          blendMode: blendMode,
          xAxisIsDate,
        }
      )

      // Apply intelligent sampling if data is too large for smooth rendering
      const MAX_CHART_POINTS = 1000
      const sampledData =
        chartData.length > MAX_CHART_POINTS
          ? intelligentSample(chartData, MAX_CHART_POINTS, metricColumns[0])
          : chartData

      // Return transformed data with metadata
      return NextResponse.json({
        data: sampledData,
        meta: {
          transformed: true,
          originalRowCount: blendedRows.length,
          sampledRowCount: sampledData.length,
          xAxisIsDate,
          dataKeys: Object.keys(sampledData[0] || {}).filter(
            (k) => k !== 'name'
          ),
        },
      })
    }

    // Return raw blended rows (legacy behavior for non-chart consumers)
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
