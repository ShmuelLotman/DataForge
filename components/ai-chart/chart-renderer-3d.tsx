'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
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
import type { ChartConfig } from '@dataforge/types'
import { formatDateLabel, isDateString } from '@/lib/date-utils'

const CHART_COLORS = [
  'oklch(0.65 0.22 260)', // Indigo
  'oklch(0.7 0.18 190)', // Cyan
  'oklch(0.75 0.18 150)', // Green
  'oklch(0.8 0.15 80)', // Orange
  'oklch(0.7 0.2 320)', // Pink
]

interface ChartRendererProps {
  config: ChartConfig
  data: Record<string, unknown>[]
}

export function ChartRenderer({ config, data }: ChartRendererProps) {
  const { chartType, xAxis, yAxis, groupBy, bucket } = config

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []

    // Determine if x-axis is a date
    const isDateAxis =
      data[0] &&
      typeof data[0][xAxis] === 'string' &&
      isDateString(data[0][xAxis])

    if (groupBy) {
      // Pivot data for grouped charts
      const map = new Map<string, Record<string, unknown>>()

      for (const row of data) {
        const rawX = String(row[xAxis])
        const formattedX = isDateAxis
          ? formatDateLabel(rawX, bucket || 'day')
          : rawX
        const groupVal = String(row[groupBy] || 'Unknown')

        if (!map.has(formattedX)) {
          map.set(formattedX, { name: formattedX })
        }

        const entry = map.get(formattedX)!
        for (const yCol of yAxis) {
          const key = yAxis.length > 1 ? `${groupVal} - ${yCol}` : groupVal
          entry[key] = row[yCol]
        }
      }

      return Array.from(map.values())
    }

    return data.map((row) => {
      const rawX = String(row[xAxis])
      const formattedX = isDateAxis
        ? formatDateLabel(rawX, bucket || 'day')
        : rawX

      const item: Record<string, unknown> = { name: formattedX }
      for (const yCol of yAxis) {
        item[yCol] = row[yCol]
      }
      return item
    })
  }, [data, xAxis, yAxis, groupBy, bucket])

  const dataKeys = useMemo(() => {
    if (groupBy && processedData.length > 0) {
      const keys = new Set<string>()
      for (const row of processedData) {
        for (const key of Object.keys(row)) {
          if (key !== 'name') keys.add(key)
        }
      }
      return Array.from(keys)
    }
    return yAxis
  }, [processedData, groupBy, yAxis])

  const chartStyle = {
    grid: 'oklch(0.25 0.02 260 / 0.5)',
    axis: 'oklch(0.5 0.02 260)',
    tooltip: {
      bg: 'oklch(0.12 0.02 260 / 0.95)',
      border: 'oklch(0.3 0.05 260)',
    },
  }

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartStyle.grid} />
              <XAxis dataKey="name" stroke={chartStyle.axis} fontSize={12} />
              <YAxis stroke={chartStyle.axis} fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartStyle.tooltip.bg,
                  border: `1px solid ${chartStyle.tooltip.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend />
              {dataKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{
                    fill: CHART_COLORS[i % CHART_COLORS.length],
                    strokeWidth: 0,
                  }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartStyle.grid} />
              <XAxis dataKey="name" stroke={chartStyle.axis} fontSize={12} />
              <YAxis stroke={chartStyle.axis} fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartStyle.tooltip.bg,
                  border: `1px solid ${chartStyle.tooltip.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend />
              {dataKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={processedData}>
              <defs>
                {dataKeys.map((key, i) => (
                  <linearGradient
                    key={key}
                    id={`gradient-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartStyle.grid} />
              <XAxis dataKey="name" stroke={chartStyle.axis} fontSize={12} />
              <YAxis stroke={chartStyle.axis} fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartStyle.tooltip.bg,
                  border: `1px solid ${chartStyle.tooltip.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend />
              {dataKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={`url(#gradient-${i})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={processedData}
                dataKey={dataKeys[0]}
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="70%"
                innerRadius="40%"
                paddingAngle={2}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
              >
                {processedData.map((_, index) => (
                  <Cell
                    key={index}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: chartStyle.tooltip.bg,
                  border: `1px solid ${chartStyle.tooltip.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke={chartStyle.grid} />
              <XAxis
                type="number"
                dataKey="name"
                name={xAxis}
                stroke={chartStyle.axis}
                fontSize={12}
              />
              <YAxis
                type="number"
                dataKey={dataKeys[0]}
                name={yAxis[0]}
                stroke={chartStyle.axis}
                fontSize={12}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: chartStyle.tooltip.bg,
                  border: `1px solid ${chartStyle.tooltip.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Legend />
              <Scatter
                name={yAxis[0]}
                data={processedData}
                fill={CHART_COLORS[0]}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )

      default:
        return null
    }
  }

  return (
    <motion.div
      className="h-full w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {renderChart()}
    </motion.div>
  )
}
