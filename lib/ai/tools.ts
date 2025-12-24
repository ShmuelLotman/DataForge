import { tool, zodSchema } from 'ai'
import { z } from 'zod'
import { findRelevantContext } from './rag'
import { executeDatasetQuery, getDataset } from '@/lib/db-actions'
import { supabase } from '@/lib/supabase'
import type { ChartConfig, ColumnSchema } from '@dataforge/types'

/**
 * Create AI tools for a specific dataset
 * These tools are schema-driven and work for any dataset structure
 */
export function createDatasetTools(datasetId: string) {
  return {
    /**
     * Get comprehensive dataset overview
     * This is the FIRST tool to use for general questions about the dataset
     */
    getDatasetOverview: tool({
      description:
        'Get a comprehensive overview of the dataset including row count, column details, date ranges, and key statistics. USE THIS FIRST when users ask general questions like "What\'s in this dataset?", "Tell me about this data", "What can I analyze?", or any question about the dataset structure.',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        try {
          // Get dataset metadata
          const dataset = await getDataset(datasetId)
          if (!dataset) {
            return { success: false, error: 'Dataset not found' }
          }

          const schema = dataset.canonicalSchema || []

          // Get actual row count
          const { count: rowCount } = await supabase
            .from('data_rows')
            .select('*', { count: 'exact', head: true })
            .eq('dataset_id', datasetId)

          // Get date range if applicable
          let dateRange: { min: string; max: string } | null = null
          const { data: minDate } = await supabase
            .from('data_rows')
            .select('parsed_date')
            .eq('dataset_id', datasetId)
            .not('parsed_date', 'is', null)
            .order('parsed_date', { ascending: true })
            .limit(1)

          const { data: maxDate } = await supabase
            .from('data_rows')
            .select('parsed_date')
            .eq('dataset_id', datasetId)
            .not('parsed_date', 'is', null)
            .order('parsed_date', { ascending: false })
            .limit(1)

          if (minDate?.[0]?.parsed_date && maxDate?.[0]?.parsed_date) {
            dateRange = {
              min: new Date(minDate[0].parsed_date).toISOString().split('T')[0],
              max: new Date(maxDate[0].parsed_date).toISOString().split('T')[0],
            }
          }

          // Get sample data for statistics
          const { data: sampleRows } = await supabase
            .from('data_rows')
            .select('data')
            .eq('dataset_id', datasetId)
            .limit(500)

          const sampleData = (sampleRows || []).map(
            (r) => r.data as Record<string, unknown>
          )

          // Calculate statistics for each column
          const columnStats = calculateColumnStats(sampleData, schema)

          // Categorize columns
          const metrics = schema.filter((c) => c.role === 'metric')
          const dimensions = schema.filter((c) => c.role === 'dimension')
          const dateColumns = schema.filter((c) => c.type === 'date')

          return {
            success: true,
            dataset: {
              name: dataset.name,
              description: dataset.description || null,
              totalRows: rowCount || 0,
              columnCount: schema.length,
            },
            columns: {
              metrics: metrics.map((c) => ({
                name: c.id,
                label: c.label,
                type: c.type,
                stats: columnStats[c.id],
              })),
              dimensions: dimensions.map((c) => ({
                name: c.id,
                label: c.label,
                type: c.type,
                stats: columnStats[c.id],
              })),
              dateColumns: dateColumns.map((c) => c.id),
            },
            dateRange,
            summary: buildDatasetSummary(
              dataset.name,
              rowCount || 0,
              schema,
              dateRange,
              columnStats
            ),
          }
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to get dataset overview',
          }
        }
      },
    }),

    /**
     * Search dataset context for relevant information via RAG
     */
    getDatasetContext: tool({
      description:
        'Search the dataset embeddings for specific information about columns, statistics, sample values, or patterns. Use this when you need to find specific details that getDatasetOverview might not cover, or when searching for particular column information.',
      inputSchema: zodSchema(
        z.object({
          query: z
            .string()
            .describe(
              'What information to search for - be specific about what you need (e.g., "what are the unique values in the category column", "date range of the data", "statistics for the sales column")'
            ),
        })
      ),
      execute: async ({ query }) => {
        // Use lower threshold for better recall
        const context = await findRelevantContext(datasetId, query, {
          threshold: 0.3, // Lower threshold for better recall
          limit: 8, // Get more results
        })

        if (context.length === 0) {
          // If no RAG results, suggest using getDatasetOverview
          return {
            found: false,
            message:
              'No specific context found for this query. Try using getDatasetOverview for general dataset information, or queryRawData to inspect actual data.',
            suggestion: 'Use getDatasetOverview or queryRawData instead',
          }
        }

        return {
          found: true,
          resultCount: context.length,
          context: context.map((c) => ({
            type: c.contentType,
            content: c.content,
            relevance: Math.round(c.similarity * 100) + '%',
          })),
        }
      },
    }),

    /**
     * Query raw data rows from the dataset with flexible filtering
     * This is the most powerful tool - use it when you need to analyze specific data points,
     * filter by dates, find max/min values, or answer questions about specific records.
     */
    queryRawData: tool({
      description:
        'Query raw data rows from the dataset with flexible filtering. Use this for questions like "what was the highest value on Nov 20th?", "show me all records where category is X", "find the record with the maximum sales", etc. This returns actual data rows that you can analyze. Supports date filtering, column filtering, sorting, and limiting results.',
      inputSchema: zodSchema(
        z.object({
          filters: z
            .array(
              z.object({
                column: z.string().describe('Column name to filter on'),
                operator: z
                  .enum([
                    'eq',
                    'ne',
                    'gt',
                    'gte',
                    'lt',
                    'lte',
                    'contains',
                    'in',
                    'between',
                  ])
                  .describe('Comparison operator'),
                value: z
                  .any()
                  .describe(
                    'Value to compare against. For "between", use array [start, end]. For "in", use array of values.'
                  ),
              })
            )
            .optional()
            .describe('Filters to apply to the data'),
          dateColumn: z
            .string()
            .optional()
            .describe(
              'If filtering by date, specify the date column name. Will use parsed_date if not specified and date filters are provided.'
            ),
          dateFilter: z
            .object({
              start: z
                .string()
                .describe('Start date (YYYY-MM-DD or ISO string)'),
              end: z.string().describe('End date (YYYY-MM-DD or ISO string)'),
            })
            .optional()
            .describe('Filter by date range using parsed_date'),
          orderBy: z
            .object({
              column: z.string().describe('Column to sort by'),
              direction: z.enum(['asc', 'desc']).default('desc'),
            })
            .optional()
            .describe('Sort the results'),
          limit: z
            .number()
            .min(1)
            .max(1000)
            .optional()
            .default(100)
            .describe('Maximum number of rows to return'),
          columns: z
            .array(z.string())
            .optional()
            .describe(
              'Specific columns to return. If not specified, returns all columns.'
            ),
        })
      ),
      execute: async (config) => {
        try {
          let query = supabase
            .from('data_rows')
            .select('data, parsed_date, id')
            .eq('dataset_id', datasetId)

          // Apply date filter if provided
          if (config.dateFilter && typeof config.dateFilter === 'object') {
            const dateFilter = config.dateFilter as {
              start: string
              end: string
            }
            const startDate = new Date(dateFilter.start)
            const endDate = new Date(dateFilter.end)
            // Set end date to end of day
            endDate.setHours(23, 59, 59, 999)

            query = query
              .gte('parsed_date', startDate.toISOString())
              .lte('parsed_date', endDate.toISOString())
          }

          // Note: Supabase query builder doesn't support JSONB path queries directly
          // We'll fetch data and filter in memory for JSONB column filters
          // Date filtering can be done at DB level using parsed_date

          // Note: Supabase doesn't support ordering by JSONB paths directly
          // We'll sort in memory after fetching
          // Default ordering by parsed_date desc if available (for date queries)
          if (!config.orderBy) {
            query = query.order('parsed_date', { ascending: false })
          }

          // Apply limit - fetch more if we have filters (since we filter in memory)
          const limit = typeof config.limit === 'number' ? config.limit : 100
          const fetchLimit =
            config.filters &&
            Array.isArray(config.filters) &&
            config.filters.length > 0
              ? Math.min(limit * 10, 5000) // Fetch up to 10x more if filtering, max 5000
              : limit
          query = query.limit(fetchLimit)

          const { data, error } = await query

          if (error) {
            return {
              success: false,
              error: error.message,
              details: error,
            }
          }

          // Transform results - extract data JSONB and include parsed_date
          let rows = (data || []).map((row: any) => {
            const rowData = row.data || {}
            // If specific columns requested, filter them
            if (
              config.columns &&
              Array.isArray(config.columns) &&
              config.columns.length > 0
            ) {
              const filtered: Record<string, unknown> = {}
              for (const col of config.columns) {
                if (col in rowData) {
                  filtered[col] = rowData[col]
                }
              }
              return {
                ...filtered,
                _parsed_date: row.parsed_date,
                _id: row.id,
              }
            }
            return {
              ...rowData,
              _parsed_date: row.parsed_date,
              _id: row.id,
            }
          })

          // Apply JSONB column filters in memory (since Supabase doesn't support JSONB path queries)
          if (
            config.filters &&
            Array.isArray(config.filters) &&
            config.filters.length > 0
          ) {
            rows = rows.filter((row) => {
              return config.filters!.every((filter) => {
                const columnValue = row[filter.column]
                const value = filter.value

                switch (filter.operator) {
                  case 'eq':
                    return String(columnValue) === String(value)
                  case 'ne':
                    return String(columnValue) !== String(value)
                  case 'gt':
                    return Number(columnValue) > Number(value)
                  case 'gte':
                    return Number(columnValue) >= Number(value)
                  case 'lt':
                    return Number(columnValue) < Number(value)
                  case 'lte':
                    return Number(columnValue) <= Number(value)
                  case 'contains':
                    return String(columnValue)
                      .toLowerCase()
                      .includes(String(value).toLowerCase())
                  case 'in':
                    if (Array.isArray(value)) {
                      return value.some(
                        (v) => String(columnValue) === String(v)
                      )
                    }
                    return false
                  case 'between':
                    if (Array.isArray(value) && value.length === 2) {
                      const num = Number(columnValue)
                      return num >= Number(value[0]) && num <= Number(value[1])
                    }
                    return false
                  default:
                    return true
                }
              })
            })
          }

          // Apply in-memory sorting if orderBy is specified and not already sorted by parsed_date
          if (config.orderBy && typeof config.orderBy === 'object') {
            const orderBy = config.orderBy as {
              column: string
              direction: 'asc' | 'desc'
            }
            rows.sort((a, b) => {
              const aVal = a[orderBy.column]
              const bVal = b[orderBy.column]
              const aNum = Number(aVal)
              const bNum = Number(bVal)

              // Try numeric comparison first
              if (!isNaN(aNum) && !isNaN(bNum)) {
                return orderBy.direction === 'asc' ? aNum - bNum : bNum - aNum
              }

              // Fall back to string comparison
              const aStr = String(aVal || '')
              const bStr = String(bVal || '')
              if (orderBy.direction === 'asc') {
                return aStr.localeCompare(bStr)
              } else {
                return bStr.localeCompare(aStr)
              }
            })
          }

          // Apply final limit after filtering
          const limitValue =
            typeof config.limit === 'number' ? config.limit : 100
          const finalRows = rows.slice(0, limitValue)

          return {
            success: true,
            rows: finalRows,
            count: finalRows.length,
            totalFiltered: rows.length,
            limit: limitValue,
            note: 'Use _parsed_date for the parsed date value, _id for the row ID. All data columns are available in each row object.',
          }
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to query raw data',
            details: error instanceof Error ? error.stack : String(error),
          }
        }
      },
    }),

    /**
     * Get basic statistics for a metric column (no grouping needed)
     */
    getMetricStatistics: tool({
      description:
        'Get basic statistics (sum, average, count, min, max) for one or more metric columns. Use this for simple questions like "what is the total sales?", "what is the average price?", "how many records are there?". This tool does NOT require grouping - it gives overall statistics.',
      inputSchema: zodSchema(
        z.object({
          metrics: z
            .array(
              z.object({
                column: z.string().describe('Column name for the metric'),
                aggregation: z
                  .enum(['sum', 'avg', 'count', 'min', 'max'])
                  .describe('Aggregation function to apply'),
              })
            )
            .min(1)
            .describe('Metrics to calculate'),
          filters: z
            .array(
              z.object({
                column: z.string(),
                op: z.enum(['eq', 'in']),
                value: z.any(),
              })
            )
            .optional()
            .describe('Optional filters to apply'),
        })
      ),
      execute: async (config) => {
        try {
          // Get dataset to find a valid column for grouping
          const dataset = await getDataset(datasetId)
          if (!dataset) {
            return {
              success: false,
              error: 'Dataset not found',
            }
          }

          // Find a dimension column to use for grouping (we'll aggregate all together)
          // Use the first dimension column, or first column if no dimensions
          const schema = dataset.canonicalSchema || []
          const dimensionCol = schema.find((c) => c.role === 'dimension')
          const firstCol = schema[0]
          const groupColumn = dimensionCol?.id || firstCol?.id

          if (!groupColumn) {
            return {
              success: false,
              error: 'No columns found in dataset schema',
            }
          }

          // Use the grouping column - since we're grouping by it, we'll get one row per unique value
          // But for totals, we want everything together, so we'll sum all the results
          const queryConfig = {
            x: {
              column: groupColumn,
              bucket: null,
            },
            y: config.metrics.map((m) => ({
              column: m.column,
              agg: m.aggregation,
            })),
            groupBy: [],
            filters: config.filters || [],
          }

          const data = await executeDatasetQuery(datasetId, queryConfig)

          // For aggregations like sum, we need to sum all grouped results
          // For avg, we need to calculate weighted average
          // For count, sum all counts
          // For min/max, find the min/max across all groups
          const result: Record<string, number> = {}

          for (const metric of config.metrics) {
            const values = data
              .map((row) => {
                const val = row[metric.column]
                return typeof val === 'number'
                  ? val
                  : parseFloat(String(val)) || 0
              })
              .filter((v) => !isNaN(v))

            if (values.length === 0) {
              result[metric.column] = null
              continue
            }

            switch (metric.aggregation) {
              case 'sum':
                result[metric.column] = values.reduce((a, b) => a + b, 0)
                break
              case 'avg':
                result[metric.column] =
                  values.reduce((a, b) => a + b, 0) / values.length
                break
              case 'count':
                result[metric.column] = values.reduce((a, b) => a + b, 0)
                break
              case 'min':
                result[metric.column] = Math.min(...values)
                break
              case 'max':
                result[metric.column] = Math.max(...values)
                break
            }
          }

          return {
            success: true,
            statistics: result,
            metrics: config.metrics.map((m) => ({
              column: m.column,
              aggregation: m.aggregation,
              value: result[m.column] ?? null,
            })),
            note: 'These are overall statistics across all data',
          }
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to get statistics',
            details: error instanceof Error ? error.stack : String(error),
          }
        }
      },
    }),

    /**
     * Query actual data from the dataset with grouping
     */
    queryDatasetData: tool({
      description:
        'Query grouped data from the dataset. Use this when the user asks questions like "show me sales by category", "top 10 products", "sales over time", etc. This requires grouping by a dimension column (xAxis). For simple totals/averages without grouping, use getMetricStatistics instead.',
      inputSchema: zodSchema(
        z.object({
          xAxis: z
            .string()
            .describe('Column name to group by (required for this tool)'),
          yAxis: z
            .array(
              z.object({
                column: z.string().describe('Column name for the metric'),
                aggregation: z
                  .enum(['sum', 'avg', 'count', 'min', 'max'])
                  .describe('Aggregation function to apply'),
              })
            )
            .min(1)
            .describe('Metrics to calculate'),
          groupBy: z
            .array(z.string())
            .optional()
            .describe(
              'Additional columns to group by (for multi-dimensional analysis)'
            ),
          bucket: z
            .enum(['day', 'week', 'month'])
            .optional()
            .nullable()
            .describe('Time bucket if x-axis is a date column'),
          filters: z
            .array(
              z.object({
                column: z.string(),
                op: z.enum(['eq', 'in']),
                value: z.any(),
              })
            )
            .optional()
            .describe('Optional filters to apply'),
          limit: z
            .number()
            .optional()
            .default(100)
            .describe('Maximum number of results to return'),
          orderBy: z
            .enum(['asc', 'desc'])
            .optional()
            .default('desc')
            .describe('Sort order for results'),
        })
      ),
      execute: async (config) => {
        try {
          const queryConfig = {
            x: {
              column: config.xAxis,
              bucket: config.bucket || null,
            },
            y: config.yAxis.map((y) => ({
              column: y.column,
              agg: y.aggregation,
            })),
            groupBy: config.groupBy || [],
            filters: config.filters || [],
          }

          const data = await executeDatasetQuery(datasetId, queryConfig)

          // Sort results
          let sortedData = [...data]
          if (config.yAxis.length > 0) {
            const firstMetric = config.yAxis[0].column
            sortedData.sort((a, b) => {
              const aVal = Number(a[firstMetric]) || 0
              const bVal = Number(b[firstMetric]) || 0
              return config.orderBy === 'desc' ? bVal - aVal : aVal - bVal
            })
          }

          // Limit results
          const limitedData = sortedData.slice(0, config.limit || 100)

          return {
            success: true,
            data: limitedData,
            totalRows: data.length,
            returnedRows: limitedData.length,
            config: {
              xAxis: config.xAxis,
              yAxis: config.yAxis,
              groupBy: config.groupBy,
            },
          }
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to query dataset',
            details: error instanceof Error ? error.stack : String(error),
          }
        }
      },
    }),

    /**
     * Generate a chart configuration
     */
    generateChart: tool({
      description:
        'Generate a chart visualization based on user request. Always call getDatasetContext first to understand available columns.',
      inputSchema: zodSchema(
        z.object({
          chartType: z
            .enum(['line', 'bar', 'area', 'pie', 'scatter'])
            .describe('Type of chart to generate'),
          xAxis: z.string().describe('Column name for x-axis'),
          yAxis: z
            .array(z.string())
            .min(1)
            .describe('Column name(s) for y-axis metrics'),
          groupBy: z
            .string()
            .nullable()
            .optional()
            .describe('Optional column to group/color by'),
          bucket: z
            .enum(['day', 'week', 'month'])
            .nullable()
            .optional()
            .describe('Time bucket for date x-axis'),
          dateRange: z
            .object({
              start: z.string().describe('Start date YYYY-MM-DD'),
              end: z.string().describe('End date YYYY-MM-DD'),
            })
            .nullable()
            .optional()
            .describe('Date range filter'),
          aggregation: z
            .enum(['sum', 'avg', 'count', 'min', 'max'])
            .optional()
            .default('sum')
            .describe('Aggregation function for metrics'),
          title: z.string().optional().describe('Optional chart title'),
        })
      ),
      execute: async (config): Promise<ChartConfig & { title?: string }> => {
        // Return the config directly - client will render it
        return {
          chartType: config.chartType,
          xAxis: config.xAxis,
          yAxis: config.yAxis,
          groupBy: config.groupBy ?? null,
          bucket: config.bucket ?? null,
          dateRange: config.dateRange
            ? {
                start: config.dateRange.start,
                end: config.dateRange.end,
              }
            : null,
          aggregation: config.aggregation,
          title: config.title,
        }
      },
    }),

    /**
     * Update an existing chart
     */
    updateChart: tool({
      description:
        'Modify the current chart configuration. Use this when the user wants to change chart type, add/remove metrics, change grouping, etc.',
      inputSchema: zodSchema(
        z.object({
          changes: z.object({
            chartType: z
              .enum(['line', 'bar', 'area', 'pie', 'scatter'])
              .optional(),
            xAxis: z.string().optional(),
            yAxis: z.array(z.string()).optional(),
            groupBy: z.string().nullable().optional(),
            bucket: z.enum(['day', 'week', 'month']).nullable().optional(),
            dateRange: z
              .object({
                start: z.string(),
                end: z.string(),
              })
              .nullable()
              .optional(),
            aggregation: z
              .enum(['sum', 'avg', 'count', 'min', 'max'])
              .optional(),
          }),
          explanation: z.string().describe('Brief explanation of what changed'),
        })
      ),
      execute: async ({ changes, explanation }) => {
        return { changes, explanation, action: 'update' }
      },
    }),

    /**
     * Save current chart to a dashboard
     */
    saveToDashboard: tool({
      description:
        'Save the current chart to a dashboard. Ask the user which dashboard or if they want to create a new one.',
      inputSchema: zodSchema(
        z.object({
          dashboardId: z
            .string()
            .optional()
            .describe('Existing dashboard ID, or omit to create new'),
          dashboardName: z
            .string()
            .optional()
            .describe('Name for new dashboard'),
          panelTitle: z.string().describe('Title for this chart panel'),
        })
      ),
      execute: async (params) => {
        return { action: 'saveToDashboard', ...params }
      },
    }),
  }
}

export type DatasetTools = ReturnType<typeof createDatasetTools>

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate statistics for each column based on sample data
 * Generic approach - works for any column type
 */
function calculateColumnStats(
  data: Record<string, unknown>[],
  schema: ColumnSchema[]
): Record<string, Record<string, unknown>> {
  const stats: Record<string, Record<string, unknown>> = {}

  for (const col of schema) {
    const values = data.map((row) => row[col.id])
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ''
    )

    const colStats: Record<string, unknown> = {
      nullCount: values.length - nonNullValues.length,
      nonNullCount: nonNullValues.length,
    }

    if (col.type === 'number') {
      const numericValues = nonNullValues
        .map((v) => Number(v))
        .filter((n) => !isNaN(n))

      if (numericValues.length > 0) {
        colStats.min = Math.min(...numericValues)
        colStats.max = Math.max(...numericValues)
        colStats.sum = numericValues.reduce((a, b) => a + b, 0)
        colStats.avg = (colStats.sum as number) / numericValues.length
      }
    } else if (col.type === 'date') {
      const dateValues = nonNullValues
        .map((v) => new Date(String(v)))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())

      if (dateValues.length > 0) {
        colStats.dateMin = dateValues[0].toISOString().split('T')[0]
        colStats.dateMax = dateValues[dateValues.length - 1]
          .toISOString()
          .split('T')[0]
      }
    } else if (col.type === 'string' || col.role === 'dimension') {
      const uniqueValues = [
        ...new Set(nonNullValues.map((v) => String(v))),
      ].filter((v) => v !== 'undefined' && v !== 'null')

      colStats.uniqueCount = uniqueValues.length

      // Include sample values (more for low cardinality)
      const sampleCount = uniqueValues.length <= 20 ? uniqueValues.length : 10
      colStats.sampleValues = uniqueValues.slice(0, sampleCount)
    }

    stats[col.id] = colStats
  }

  return stats
}

/**
 * Build a human-readable summary of the dataset
 */
function buildDatasetSummary(
  name: string,
  rowCount: number,
  schema: ColumnSchema[],
  dateRange: { min: string; max: string } | null,
  columnStats: Record<string, Record<string, unknown>>
): string {
  const parts: string[] = []

  parts.push(
    `Dataset "${name}" contains ${rowCount.toLocaleString()} rows with ${
      schema.length
    } columns.`
  )

  const metrics = schema.filter((c) => c.role === 'metric')
  const dimensions = schema.filter((c) => c.role === 'dimension')

  if (metrics.length > 0) {
    parts.push(
      `Numeric metrics: ${metrics.map((c) => c.label || c.id).join(', ')}.`
    )
  }

  if (dimensions.length > 0) {
    parts.push(
      `Categorical dimensions: ${dimensions
        .map((c) => c.label || c.id)
        .join(', ')}.`
    )
  }

  if (dateRange) {
    parts.push(`Data spans from ${dateRange.min} to ${dateRange.max}.`)
  }

  // Add key statistics
  for (const metric of metrics.slice(0, 2)) {
    const stats = columnStats[metric.id]
    if (stats && stats.min !== undefined) {
      parts.push(
        `${metric.label || metric.id} ranges from ${Number(
          stats.min
        ).toLocaleString()} to ${Number(stats.max).toLocaleString()}.`
      )
    }
  }

  for (const dim of dimensions.slice(0, 2)) {
    const stats = columnStats[dim.id]
    if (stats && stats.uniqueCount !== undefined) {
      const samples = stats.sampleValues as string[] | undefined
      if (samples && samples.length > 0) {
        const sampleStr =
          (stats.uniqueCount as number) <= 10
            ? samples.join(', ')
            : `${samples.slice(0, 5).join(', ')}, ...`
        parts.push(
          `${dim.label || dim.id} has ${
            stats.uniqueCount
          } unique values: ${sampleStr}.`
        )
      }
    }
  }

  return parts.join(' ')
}
