'use client'

import { useMemo, useState, useCallback } from 'react'
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
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  LabelList,
} from 'recharts'
import { formatDateLabel, isDateString } from '@/lib/date-utils'
import { KPICard } from './kpi-card'
import { ChartLegend } from './chart-legend'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ChartRendererProps {
  data: Record<string, string | number>[]
  config: ChartConfig
  height?: string | number
  /** Show data labels on bars (values displayed on each segment) */
  showDataLabels?: boolean
  /** Show the interactive side legend (default: true for charts with >3 series) */
  showLegend?: boolean
}

// Extended color palette for many-series charts
const CHART_COLORS = [
  'oklch(0.75 0.18 165)', // teal
  'oklch(0.7 0.15 220)', // blue
  'oklch(0.75 0.2 50)', // amber
  'oklch(0.7 0.18 280)', // purple
  'oklch(0.65 0.15 340)', // pink
  'oklch(0.72 0.16 140)', // green
  'oklch(0.68 0.2 25)', // orange
  'oklch(0.65 0.12 250)', // indigo
  'oklch(0.78 0.14 95)', // lime
  'oklch(0.62 0.18 0)', // red
  'oklch(0.7 0.1 200)', // slate blue
  'oklch(0.75 0.15 320)', // magenta
  'oklch(0.68 0.12 180)', // cyan
  'oklch(0.72 0.18 70)', // gold
  'oklch(0.6 0.14 300)', // violet
  'oklch(0.76 0.12 120)', // mint
  'oklch(0.65 0.16 40)', // coral
  'oklch(0.7 0.1 240)', // periwinkle
  'oklch(0.73 0.14 85)', // chartreuse
  'oklch(0.62 0.15 355)', // crimson
]

/** Threshold for showing side legend vs inline */
const LEGEND_THRESHOLD = 3

// Format number for data labels - compact for large values
function formatDataLabel(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function ChartRenderer({
  data,
  config,
  height = '100%',
  showDataLabels = false,
  showLegend,
}: ChartRendererProps) {
  // State for hidden series (toggled via legend)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())

  // Toggle a single series
  const handleToggleSeries = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // Process data for Recharts
  const { processedData, dataKeys } = useMemo(() => {
    if (!data || data.length === 0) {
      return { processedData: [], dataKeys: [] }
    }

    const xAxis = config.xAxis
    const yAxis = config.yAxis
    const bucket = config.bucket || 'day'

    // For multi-dataset 'separate' mode, the backend adds _source column
    // Combine _source with any explicit groupBy to create compound keys
    const hasSourceColumn = data.some((row) => '_source' in row)
    const isSeparateBlend = config.blendMode === 'separate'

    // Detect if x-axis values are dates by checking first row
    const firstXValue = data[0]?.[xAxis]
    const xAxisIsDate = isDateString(firstXValue)

    let processed: Record<string, string | number>[] = []
    let keys: string[] = []

    // Determine if we need to pivot/group the data
    const hasGroupBy = !!config.groupBy
    const needsPivot = hasGroupBy || (isSeparateBlend && hasSourceColumn)

    // Debug logging for groupBy issues
    if (process.env.NODE_ENV === 'development') {
      console.log('[ChartRenderer] Pivot config:', {
        hasGroupBy,
        groupByValue: config.groupBy,
        isSeparateBlend,
        hasSourceColumn,
        needsPivot,
        sampleRow: data[0],
        groupByInData: config.groupBy ? data[0]?.[config.groupBy] : 'N/A',
      })
    }

    if (needsPivot) {
      // Pivot data for grouped charts
      const map = new Map<string, Record<string, string | number>>()
      data.forEach((row) => {
        const rawXVal = String(row[xAxis])
        // Format dates if detected
        const xVal = xAxisIsDate ? formatDateLabel(rawXVal, bucket) : rawXVal

        // Build the group key - combine _source and explicit groupBy
        const groupParts: string[] = []
        if (isSeparateBlend && hasSourceColumn) {
          groupParts.push(String(row['_source'] || 'Unknown'))
        }
        if (config.groupBy) {
          groupParts.push(String(row[config.groupBy] || 'Unknown'))
        }
        // If no grouping dimensions, just use the metric name
        const groupVal = groupParts.length > 0 ? groupParts.join(' - ') : null

        yAxis.forEach((yCol) => {
          const yVal = row[yCol]

          if (!map.has(xVal)) {
            map.set(xVal, { name: xVal })
          }
          const entry = map.get(xVal)!

          // Build the series key
          let key: string
          if (groupVal) {
            key = yAxis.length > 1 ? `${groupVal} - ${yCol}` : groupVal
          } else {
            key = yCol
          }

          // Sum values for same key (in case of multiple rows per x+group)
          const existing = entry[key]
          if (typeof existing === 'number') {
            entry[key] = existing + Number(yVal ?? 0)
          } else {
            entry[key] = Number(yVal ?? 0)
          }
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

  // Create toggle-all handler with access to dataKeys
  const handleToggleAllWithKeys = useCallback(
    (visible: boolean) => {
      if (visible) {
        setHiddenKeys(new Set())
      } else {
        setHiddenKeys(new Set(dataKeys))
      }
    },
    [dataKeys]
  )

  // Filter out hidden keys for rendering
  const visibleDataKeys = useMemo(
    () => dataKeys.filter((key) => !hiddenKeys.has(key)),
    [dataKeys, hiddenKeys]
  )

  // Build legend items with colors
  const legendItems = useMemo(
    () =>
      dataKeys.map((key, i) => ({
        key,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [dataKeys]
  )

  // Determine if we should show the side legend
  const shouldShowLegend = showLegend ?? dataKeys.length > LEGEND_THRESHOLD

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
    case 'line': {
      const lineYAxisRight = config.yAxisRight || []
      const lineHasDualAxis = lineYAxisRight.length > 0

      const lineChart = (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={processedData} margin={{ bottom: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              dataKey="name"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
              interval={0}
              angle={processedData.length > 7 ? -45 : 0}
              textAnchor={processedData.length > 7 ? 'end' : 'middle'}
              height={processedData.length > 7 ? 60 : 30}
            />
            <YAxis
              yAxisId="left"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            {lineHasDualAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="oklch(0.7 0.15 220)"
                fontSize={11}
                tickLine={false}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            {visibleDataKeys.map((key) => {
              const colorIndex = dataKeys.indexOf(key)
              const isRightAxis = lineYAxisRight.includes(key)
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[colorIndex % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    fill: CHART_COLORS[colorIndex % CHART_COLORS.length],
                  }}
                  activeDot={{ r: 5 }}
                  yAxisId={isRightAxis ? 'right' : 'left'}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      )

      if (!shouldShowLegend) return lineChart

      return (
        <div className="flex h-full">
          <div className="flex-1 min-w-0">{lineChart}</div>
          <ChartLegend
            items={legendItems}
            hiddenKeys={hiddenKeys}
            onToggle={handleToggleSeries}
            onToggleAll={handleToggleAllWithKeys}
          />
        </div>
      )
    }

    case 'bar': {
      // Support horizontal layout and stacked bars
      const isHorizontal = config.layout === 'horizontal'
      const isStacked = config.stacked === true
      const barYAxisRight = config.yAxisRight || []
      const barHasDualAxis = barYAxisRight.length > 0 && !isHorizontal

      const barChart = (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={processedData}
            layout={isHorizontal ? 'vertical' : 'horizontal'}
            margin={{ bottom: isHorizontal ? 5 : 20 }}
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
                  interval={0}
                  angle={processedData.length > 7 ? -45 : 0}
                  textAnchor={processedData.length > 7 ? 'end' : 'middle'}
                  height={processedData.length > 7 ? 60 : 30}
                />
                <YAxis
                  yAxisId="left"
                  stroke="oklch(0.65 0.01 260)"
                  fontSize={11}
                  tickLine={false}
                />
                {barHasDualAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="oklch(0.7 0.15 220)"
                    fontSize={11}
                    tickLine={false}
                  />
                )}
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
            {visibleDataKeys.map((key) => {
              const colorIndex = dataKeys.indexOf(key)
              const isRightAxis = barYAxisRight.includes(key)
              const barColor = CHART_COLORS[colorIndex % CHART_COLORS.length]
              return (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={barColor}
                  radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  stackId={isStacked ? 'stack' : undefined}
                  yAxisId={
                    isHorizontal ? undefined : isRightAxis ? 'right' : 'left'
                  }
                >
                  {showDataLabels && (
                    <LabelList
                      dataKey={key}
                      position={isHorizontal ? 'right' : 'top'}
                      formatter={formatDataLabel}
                      style={{
                        fill: 'oklch(0.9 0.01 260)',
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    />
                  )}
                </Bar>
              )
            })}
          </BarChart>
        </ResponsiveContainer>
      )

      if (!shouldShowLegend) return barChart

      return (
        <div className="flex h-full">
          <div className="flex-1 min-w-0">{barChart}</div>
          <ChartLegend
            items={legendItems}
            hiddenKeys={hiddenKeys}
            onToggle={handleToggleSeries}
            onToggleAll={handleToggleAllWithKeys}
          />
        </div>
      )
    }

    case 'area': {
      const areaYAxisRight = config.yAxisRight || []
      const areaHasDualAxis = areaYAxisRight.length > 0

      const areaChart = (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={processedData} margin={{ bottom: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              dataKey="name"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
              interval={0}
              angle={processedData.length > 7 ? -45 : 0}
              textAnchor={processedData.length > 7 ? 'end' : 'middle'}
              height={processedData.length > 7 ? 60 : 30}
            />
            <YAxis
              yAxisId="left"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
            />
            {areaHasDualAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="oklch(0.7 0.15 220)"
                fontSize={11}
                tickLine={false}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            {visibleDataKeys.map((key) => {
              const colorIndex = dataKeys.indexOf(key)
              const isRightAxis = areaYAxisRight.includes(key)
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[colorIndex % CHART_COLORS.length]}
                  fill={CHART_COLORS[colorIndex % CHART_COLORS.length]}
                  fillOpacity={0.3}
                  yAxisId={isRightAxis ? 'right' : 'left'}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      )

      if (!shouldShowLegend) return areaChart

      return (
        <div className="flex h-full">
          <div className="flex-1 min-w-0">{areaChart}</div>
          <ChartLegend
            items={legendItems}
            hiddenKeys={hiddenKeys}
            onToggle={handleToggleSeries}
            onToggleAll={handleToggleAllWithKeys}
          />
        </div>
      )
    }

    case 'pie': {
      // Support donut style with innerRadius
      const innerRadius = config.innerRadius ?? 0
      const isDonut = innerRadius > 0

      // For pie charts, filter data by hidden keys (name-based)
      const filteredPieData = processedData.filter(
        (d) => !hiddenKeys.has(String(d.name))
      )

      // Build legend items from pie slices (name-based, not dataKey-based)
      const pieLegendItems = processedData.map((d, i) => ({
        key: String(d.name),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))

      const pieChart = (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={filteredPieData}
              dataKey={dataKeys[0]}
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={isDonut ? '40%' : 0}
              outerRadius="70%"
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: 'oklch(0.5 0.01 260)' }}
            >
              {filteredPieData.map((d) => {
                // Find original index to keep color consistent
                const originalIndex = processedData.findIndex(
                  (orig) => orig.name === d.name
                )
                return (
                  <Cell
                    key={`cell-${d.name}`}
                    fill={CHART_COLORS[originalIndex % CHART_COLORS.length]}
                  />
                )
              })}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.28 0.01 260)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )

      if (processedData.length <= LEGEND_THRESHOLD) return pieChart

      return (
        <div className="flex h-full">
          <div className="flex-1 min-w-0">{pieChart}</div>
          <ChartLegend
            items={pieLegendItems}
            hiddenKeys={hiddenKeys}
            onToggle={handleToggleSeries}
            onToggleAll={(visible) => {
              if (visible) {
                setHiddenKeys(new Set())
              } else {
                setHiddenKeys(new Set(processedData.map((d) => String(d.name))))
              }
            }}
          />
        </div>
      )
    }

    case 'scatter': {
      // Scatter charts typically have few series, use simpler legend handling
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ bottom: 20 }}>
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
            <Scatter
              name={config.yAxis[0]}
              data={processedData}
              fill={CHART_COLORS[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }

    case 'table':
      // Render data as a simple table
      const tableColumns =
        config.yAxis.length > 0
          ? [config.xAxis, ...config.yAxis]
          : Object.keys(data[0] || {})

      return (
        <div className="h-full overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {tableColumns.map((col) => (
                  <TableHead key={col} className="whitespace-nowrap text-xs">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-muted/30">
                  {tableColumns.map((col) => (
                    <TableCell key={col} className="py-1.5 text-xs">
                      {typeof row[col] === 'number'
                        ? new Intl.NumberFormat('en-US', {
                            maximumFractionDigits: 2,
                          }).format(row[col] as number)
                        : String(row[col] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )

    default:
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          Unknown chart type: {chartType}
        </div>
      )
  }
}
