'use client'

import { useMemo, useState, useCallback } from 'react'
import type { ChartConfig, ColumnSchema } from '@/lib/types'
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
import { isDateString } from '@/lib/date-utils'
import { KPICard } from './kpi-card'
import { ChartLegend } from './chart-legend'
import { DataTable } from './data-table'

interface ChartRendererProps {
  data: Record<string, string | number>[]
  config: ChartConfig
  height?: string | number
  /** Show data labels on bars (values displayed on each segment) */
  showDataLabels?: boolean
  /** Show the interactive side legend (default: true for charts with >3 series) */
  showLegend?: boolean
  /** Column schema for table view (optional, will be inferred from data if not provided) */
  schema?: ColumnSchema[]
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

// Performance optimization thresholds
const MAX_TICKS = 20
const ANIMATION_THRESHOLD = 300
const DOT_THRESHOLD = 300

/** Calculate optimal X-axis tick interval to prevent rendering too many ticks */
function calculateOptimalInterval(dataLength: number): number {
  console.log('dataLength', dataLength)
  if (dataLength >= MAX_TICKS) return 0
  return Math.ceil(dataLength / MAX_TICKS) - 1
}

/** Format number for data labels - compact for large values */
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
  schema,
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

  // Extract data keys from pre-processed server data
  // Server transforms data to have 'name' as x-axis and all metrics as separate keys
  const dataKeys = useMemo(() => {
    if (!data || data.length === 0) return []

    // Collect all unique keys across all rows (except 'name')
    const keySet = new Set<string>()
    for (const row of data) {
      for (const key of Object.keys(row)) {
        if (key !== 'name') keySet.add(key)
      }
    }
    return Array.from(keySet)
  }, [data])

  // Data is already processed by the server - use directly
  // Server returns data with 'name' field as x-axis and metrics as keys
  const chartData = data as Record<string, string | number>[]

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

  // Build table schema for table view
  // Priority: tableConfig > provided schema > inferred from data
  const tableSchema = useMemo(() => {
    if (data.length === 0) return []

    const allKeys = new Set(Object.keys(data[0] || {}))
    const hasSourceColumn = allKeys.has('_source')
    const tableConfig = config.tableConfig

    // If tableConfig is provided, build schema from it (respecting column order)
    if (tableConfig && tableConfig.columns.length > 0) {
      const schemaFromConfig: ColumnSchema[] = []

      // Add _source first if present in data
      if (hasSourceColumn) {
        schemaFromConfig.push({
          id: '_source',
          label: 'Source (Dataset)',
          type: 'string',
          role: 'dimension',
        })
      }

      for (const colConfig of tableConfig.columns) {
        if (!allKeys.has(colConfig.id)) continue
        if (colConfig.id === '_source') continue // Already added

        // Find in provided schema for type info, or infer
        const schemaCol = schema?.find((s) => s.id === colConfig.id)
        const sampleValue = data[0][colConfig.id]

        let type: ColumnSchema['type'] = schemaCol?.type || 'string'
        let role: ColumnSchema['role'] = schemaCol?.role || 'dimension'

        // Infer if not in schema
        if (!schemaCol) {
          if (typeof sampleValue === 'number') {
            type = 'number'
            role = 'metric'
          } else if (typeof sampleValue === 'boolean') {
            type = 'boolean'
          } else if (
            sampleValue !== null &&
            sampleValue !== undefined &&
            isDateString(String(sampleValue))
          ) {
            type = 'date'
          }
        }

        schemaFromConfig.push({
          id: colConfig.id,
          label:
            schemaCol?.label ||
            colConfig.id.charAt(0).toUpperCase() +
              colConfig.id.slice(1).replace(/_/g, ' '),
          type,
          role,
        })
      }

      // If no columns matched from tableConfig, fall through to infer from data
      if (schemaFromConfig.length > 0) {
        return schemaFromConfig
      }
    }

    // Use provided schema if available, filter to existing columns
    if (schema && schema.length > 0) {
      const schemaFromData = schema.filter((col) => allKeys.has(col.id))

      // Include _source if it exists in data but not in schema
      if (
        hasSourceColumn &&
        !schemaFromData.some((col) => col.id === '_source')
      ) {
        schemaFromData.unshift({
          id: '_source',
          label: 'Source (Dataset)',
          type: 'string',
          role: 'dimension',
        })
      }
      return schemaFromData
    }

    // Infer schema from data
    const firstRow = data[0]
    const inferredSchema: ColumnSchema[] = []

    // Add _source first if present
    if (hasSourceColumn) {
      inferredSchema.push({
        id: '_source',
        label: 'Source (Dataset)',
        type: 'string',
        role: 'dimension',
      })
    }

    for (const [key, value] of Object.entries(firstRow)) {
      if (key === '_source') continue

      let type: ColumnSchema['type'] = 'string'
      let role: ColumnSchema['role'] = 'dimension'

      if (typeof value === 'number') {
        type = 'number'
        role = 'metric'
      } else if (typeof value === 'boolean') {
        type = 'boolean'
      } else if (
        value !== null &&
        value !== undefined &&
        isDateString(String(value))
      ) {
        type = 'date'
      }

      inferredSchema.push({
        id: key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        type,
        role,
      })
    }

    return inferredSchema
  }, [data, schema, config.tableConfig])

  const chartType = config.chartType

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    )
  }

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
          <LineChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              dataKey="name"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine
              interval={calculateOptimalInterval(chartData.length)}
              angle={chartData.length > 7 ? -45 : 0}
              textAnchor={chartData.length > 7 ? 'end' : 'middle'}
              height={chartData.length > 7 ? 60 : 30}
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
              const lineColor = CHART_COLORS[colorIndex % CHART_COLORS.length]
              return (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={lineColor}
                  strokeWidth={2}
                  dot={
                    chartData.length < DOT_THRESHOLD
                      ? {
                          r: 3,
                          fill: lineColor,
                        }
                      : false
                  }
                  activeDot={
                    chartData.length < DOT_THRESHOLD ? { r: 5 } : false
                  }
                  yAxisId={isRightAxis ? 'right' : 'left'}
                  isAnimationActive={chartData.length < ANIMATION_THRESHOLD}
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
            data={chartData}
            layout={isHorizontal ? 'vertical' : 'horizontal'}
            margin={{ bottom: isHorizontal ? 5 : 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            {isHorizontal && (
              <XAxis
                type="number"
                stroke="oklch(0.65 0.01 260)"
                fontSize={11}
                tickLine={false}
              />
            )}
            {isHorizontal && (
              <YAxis
                type="category"
                dataKey="name"
                stroke="oklch(0.65 0.01 260)"
                fontSize={11}
                tickLine={false}
                width={100}
              />
            )}
            {!isHorizontal && (
              <XAxis
                dataKey="name"
                stroke="oklch(0.65 0.01 260)"
                fontSize={11}
                tickLine
                interval={calculateOptimalInterval(chartData.length)}
                angle={chartData.length > 7 ? -45 : 0}
                textAnchor={chartData.length > 7 ? 'end' : 'middle'}
                height={chartData.length > 7 ? 60 : 30}
              />
            )}
            {!isHorizontal && (
              <YAxis
                yAxisId="left"
                stroke="oklch(0.65 0.01 260)"
                fontSize={11}
                tickLine={false}
              />
            )}
            {!isHorizontal && barHasDualAxis && (
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
                  isAnimationActive={chartData.length < ANIMATION_THRESHOLD}
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
          <AreaChart data={chartData} margin={{ bottom: 20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.28 0.01 260)"
            />
            <XAxis
              dataKey="name"
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              tickLine={false}
              interval={calculateOptimalInterval(chartData.length)}
              angle={chartData.length > 7 ? -45 : 0}
              textAnchor={chartData.length > 7 ? 'end' : 'middle'}
              height={chartData.length > 7 ? 60 : 30}
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
                  isAnimationActive={chartData.length < ANIMATION_THRESHOLD}
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
      const filteredPieData = chartData.filter(
        (d) => !hiddenKeys.has(String(d.name))
      )

      // Build legend items from pie slices (name-based, not dataKey-based)
      const pieLegendItems = chartData.map((d, i) => ({
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
                const originalIndex = chartData.findIndex(
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

      if (chartData.length <= LEGEND_THRESHOLD) return pieChart

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
                setHiddenKeys(new Set(chartData.map((d) => String(d.name))))
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
              interval={calculateOptimalInterval(chartData.length)}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey={dataKeys[0]}
              name={config.yAxis[0]}
              stroke="oklch(0.65 0.01 260)"
              fontSize={11}
              interval={calculateOptimalInterval(chartData.length)}
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
              data={chartData}
              fill={CHART_COLORS[0]}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )
    }

    case 'table':
      return (
        <DataTable
          data={data}
          schema={tableSchema}
          tableConfig={config.tableConfig}
          height={typeof height === 'string' ? height : `${height}px`}
          className="h-full"
        />
      )

    default:
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground">
          Unknown chart type: {chartType}
        </div>
      )
  }
}
