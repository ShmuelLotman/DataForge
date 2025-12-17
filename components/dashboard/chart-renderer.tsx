'use client'

import { useMemo } from 'react'
import type { ChartConfig } from '@/lib/types'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from 'recharts'
import { formatDateLabel, isDateString } from '@/lib/date-utils'
import { KPICard } from './kpi-card'

interface ChartRendererProps {
  data: Record<string, string | number>[]
  config: ChartConfig
  height?: string | number
}

const CHART_COLORS = [
  'oklch(0.75 0.18 165)', // primary teal
  'oklch(0.7 0.15 220)', // blue
  'oklch(0.75 0.2 50)', // amber
  'oklch(0.7 0.18 280)', // purple
  'oklch(0.65 0.15 340)', // pink
]

export function ChartRenderer({
  data,
  config,
  height = '100%',
}: ChartRendererProps) {
  // Process data for Recharts
  const { processedData, dataKeys } = useMemo(() => {
    if (!data || data.length === 0) {
      return { processedData: [], dataKeys: [] }
    }

    const xAxis = config.xAxis
    const yAxis = config.yAxis
    const groupBy = config.groupBy
    const bucket = config.bucket || 'day'

    // Detect if x-axis values are dates by checking first row
    const firstXValue = data[0]?.[xAxis]
    const xAxisIsDate = isDateString(firstXValue)

    let processed: Record<string, string | number>[] = []
    let keys: string[] = []

    if (groupBy) {
      // Pivot data for grouped charts
      const map = new Map<string, Record<string, string | number>>()
      data.forEach((row) => {
        const rawXVal = String(row[xAxis])
        // Format dates if detected
        const xVal = xAxisIsDate ? formatDateLabel(rawXVal, bucket) : rawXVal
        const groupVal = String(row[groupBy] || 'Unknown')

        yAxis.forEach((yCol) => {
          const yVal = row[yCol]

          if (!map.has(xVal)) {
            map.set(xVal, { name: xVal })
          }
          const entry = map.get(xVal)!
          const key = yAxis.length > 1 ? `${groupVal} - ${yCol}` : groupVal
          entry[key] = yVal
        })
      })
      processed = Array.from(map.values())

      // Extract all keys except 'name'
      const keySet = new Set<string>()
      processed.forEach((row) => {
        Object.keys(row).forEach((k) => {
          if (k !== 'name') keySet.add(k)
        })
      })
      keys = Array.from(keySet)
    } else {
      processed = data.map((row) => {
        const rawXVal = String(row[xAxis])
        // Format dates if detected
        const formattedX = xAxisIsDate
          ? formatDateLabel(rawXVal, bucket)
          : rawXVal
        const item: Record<string, string | number> = { name: formattedX }
        yAxis.forEach((yCol) => {
          item[yCol] = row[yCol]
        })
        return item
      })
      keys = yAxis
    }

    return { processedData: processed, dataKeys: keys }
  }, [data, config])

  if (processedData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    )
  }

  const chartType = config.chartType

  // Handle KPI type separately (doesn't need processed data)
  if (chartType === 'kpi') {
    // For KPI, we expect a single aggregated value
    // The data should have one row with the y-axis column
    const yColumn = config.yAxis[0]
    const value = data[0]?.[yColumn] as number | undefined

    return <KPICard value={value} config={config} height={height} />
  }

  switch (chartType) {
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={processedData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              dataKey="name"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {dataKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length] }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )

    case 'bar':
      // Support horizontal layout and stacked bars
      const isHorizontal = config.layout === 'horizontal'
      const isStacked = config.stacked === true

      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={processedData}
            layout={isHorizontal ? 'vertical' : 'horizontal'}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            {isHorizontal ? (
              <>
                <XAxis
                  type="number"
                  stroke="oklch(0.65 0.01 260)"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="oklch(0.65 0.01 260)"
                  fontSize={11}
                  tickLine={false}
                  width={100}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="name"
                  stroke="oklch(0.65 0.01 260)"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="oklch(0.65 0.01 260)"
                  fontSize={11}
                  tickLine={false}
                />
              </>
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {dataKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                stackId={isStacked ? 'stack' : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )

    case 'area':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={processedData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              dataKey="name"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {dataKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )

    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={processedData}
              dataKey={dataKeys[0]}
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="70%"
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: 'oklch(0.5 0.01 260)' }}
            >
              {processedData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      )

    case 'scatter':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              type="number"
              dataKey="name"
              name={config.xAxis}
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey={dataKeys[0]}
              name={config.yAxis[0]}
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Scatter
              name={config.yAxis[0]}
              data={processedData}
              fill={CHART_COLORS[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )

    default:
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          Unknown chart type: {chartType}
        </div>
      )
  }
}
