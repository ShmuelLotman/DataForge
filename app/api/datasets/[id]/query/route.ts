import { NextResponse } from 'next/server'
import { executeDatasetQuery, getDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'
import { transformChartData, intelligentSample } from '@/lib/chart-transform'
import { isDateString } from '@/lib/date-utils'
import type { BucketType } from '@dataforge/types'

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

interface QueryRequestBody {
  x: XAxisConfig
  y: YAxisConfig[]
  groupBy?: GroupByConfig[]
  filters?: unknown[]
  limit?: number
  sortBy?: {
    column: string
    direction: 'asc' | 'desc'
  }
  aggregateOnly?: boolean
  // Request server-side chart transformation
  transformForChart?: boolean
}

type DataRow = Record<string, string | number | null>

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id } = await params

    // Verify dataset ownership
    const dataset = await getDataset(id, session.user.id)
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    const body = (await request.json()) as QueryRequestBody

    // Basic validation
    if (!body.x || !body.y) {
      return NextResponse.json(
        { error: 'Missing required parameters: x and y configuration' },
        { status: 400 }
      )
    }

    // Auto-detect KPI mode from legacy x-axis values
    const isKpiMode =
      body.aggregateOnly === true ||
      body.x?.column === '_kpi' ||
      body.x?.column === '_unused'

    // Ensure aggregateOnly is set for KPI queries
    const queryBody = isKpiMode ? { ...body, aggregateOnly: true } : body

    const rawData = (await executeDatasetQuery(id, queryBody)) as DataRow[]

    // ============================================
    // SERVER-SIDE CHART TRANSFORMATION
    // ============================================
    // If transformForChart is enabled, pivot and format data for Recharts
    // This moves heavy processing from frontend to server
    if (body.transformForChart && !isKpiMode) {
      const xColumn = body.x.column
      const metricColumns = body.y.map((y) => y.column)

      // Detect if x-axis is a date column by checking the first row's value
      const firstXValue = rawData[0]?.[xColumn]
      const xAxisIsDate = isDateString(firstXValue)

      // Get groupBy column if specified
      const groupByColumn =
        body.groupBy && body.groupBy.length > 0
          ? body.groupBy[0].column
          : undefined

      // Determine bucket type (filter out 'none')
      const bucketValue =
        body.x.bucket && body.x.bucket !== 'none'
          ? (body.x.bucket as BucketType)
          : undefined

      // Transform data into Recharts-ready format
      const chartData = transformChartData(
        rawData as Record<string, unknown>[],
        {
          xAxis: xColumn,
          yAxis: metricColumns,
          groupBy: groupByColumn,
          bucket: bucketValue,
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
          originalRowCount: rawData.length,
          sampledRowCount: sampledData.length,
          xAxisIsDate,
          dataKeys: Object.keys(sampledData[0] || {}).filter(
            (k) => k !== 'name'
          ),
        },
      })
    }

    // Return raw data (legacy behavior for non-chart consumers or KPI)
    return NextResponse.json(rawData)
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
