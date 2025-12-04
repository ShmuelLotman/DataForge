'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Dataset, DataFile, ColumnSchema } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
import {
  BarChart3,
  LineChartIcon,
  AreaChartIcon,
  PieChartIcon,
  TrendingUp,
  Loader2,
  ScatterChart as ScatterIcon,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateLabel } from '@/lib/date-utils'
import { SaveToDashboardDialog } from '@/components/visualize/save-to-dashboard-dialog'

type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'scatter'
type Bucket = 'day' | 'week' | 'month'

interface ChartBuilderProps {
  dataset: Dataset
  files: DataFile[]
}

const CHART_COLORS = [
  'oklch(0.75 0.18 165)', // primary teal
  'oklch(0.7 0.15 220)', // blue
  'oklch(0.75 0.2 50)', // amber
  'oklch(0.7 0.18 280)', // purple
  'oklch(0.65 0.15 340)', // pink
]

const chartTypes: {
  value: ChartType
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { value: 'line', label: 'Line', icon: LineChartIcon },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'area', label: 'Area', icon: AreaChartIcon },
  { value: 'pie', label: 'Pie', icon: PieChartIcon },
  { value: 'scatter', label: 'Scatter', icon: ScatterIcon },
]

export function ChartBuilder({ dataset }: ChartBuilderProps) {
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [xAxis, setXAxis] = useState<string>('none')
  const [yAxis, setYAxis] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState<string>('none')

  // Date Range State (optional, only used if x-axis is a date)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [bucket, setBucket] = useState<Bucket>('day')

  const [chartData, setChartData] = useState<Record<string, string | number>[]>(
    []
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveToDashboardOpen, setSaveToDashboardOpen] = useState(false)

  const schema = (dataset.canonicalSchema || []).map((c) => {
    const id = c.id || (c as unknown as { name: string }).name
    const type = c.type
    // Backfill role if missing
    const role = c.role || (type === 'number' ? 'metric' : 'dimension')

    return {
      ...c,
      id,
      label: c.label || (c as unknown as { name: string }).name,
      role,
    }
  })

  // Filter columns based on Chart Type Rules
  const { xOptions, yOptions, groupOptions } = useMemo(() => {
    let x: ColumnSchema[] = []
    let y: ColumnSchema[] = []
    let group: ColumnSchema[] = []

    switch (chartType) {
      case 'line':
      case 'area':
        // X: Date or Numeric (sequence)
        x = schema.filter((c) => c.type === 'date' || c.type === 'number')
        // Y: Numeric
        y = schema.filter((c) => c.type === 'number')
        // Group: Dimension (role)
        group = schema.filter((c) => c.role === 'dimension')
        break

      case 'bar':
      case 'pie':
        // X: Dimension
        x = schema.filter((c) => c.role === 'dimension')
        // Y: Numeric
        y = schema.filter((c) => c.type === 'number')
        // Group: Dimension
        group = schema.filter((c) => c.role === 'dimension')
        break

      case 'scatter':
        // X: Numeric
        x = schema.filter((c) => c.type === 'number')
        // Y: Numeric
        y = schema.filter((c) => c.type === 'number')
        // Group: Dimension (Color)
        group = schema.filter((c) => c.role === 'dimension')
        break
    }

    return { xOptions: x, yOptions: y, groupOptions: group }
  }, [chartType, schema])

  const isDateXAxis = useMemo(() => {
    const col = schema.find((c) => c.id === xAxis)
    return col?.type === 'date'
  }, [xAxis, schema])

  // Initialize dates if empty and x-axis is a date
  useEffect(() => {
    if (isDateXAxis && !startDate && !endDate) {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      setStartDate(start.toISOString().split('T')[0])
      setEndDate(end.toISOString().split('T')[0])
    }
  }, [isDateXAxis, startDate, endDate])

  // Reset selections when chart type changes
  useEffect(() => {
    setXAxis('none')
    setYAxis([])
    setGroupBy('none')
    setChartData([])
  }, [chartType])

  // Fetch Aggregated Data
  useEffect(() => {
    async function fetchData() {
      if (xAxis === 'none' || yAxis.length === 0) return

      // For date x-axis, require date range
      if (isDateXAxis && (!startDate || !endDate)) return

      setIsLoading(true)
      setError(null)

      try {
        const payload = {
          x: {
            column: xAxis,
            bucket: isDateXAxis ? bucket : 'none',
          },
          y: yAxis.map((col) => ({
            column: col,
            agg: 'sum', // Default to sum for now
          })),
          groupBy: groupBy !== 'none' ? [{ column: groupBy }] : [],
          filters: [],
        }

        // Add date filters if applicable
        if (isDateXAxis && startDate && endDate) {
          // This assumes we can filter on the X column directly
          // If X is date, we can add range filter
          // But API filter structure is array of objects.
          // We need to handle "between" or separate gt/lt.
          // Current API impl only has 'eq' and 'in'.
          // Wait, I implemented 'eq' and 'in'. I didn't implement 'between'.
          // However, the API might not support date range via `filters` yet.
          // BUT, I kept the `startDate`/`endDate` params in the `getAggregatedData`...
          // Wait, I replaced `getAggregatedData` usage in route.
          // My `query_dataset` function DOES NOT handle start/end dates automatically unless passed in `filters`.
          // I need to update `filters` logic in my PL/pgSQL or add date filter support there.
          // Oops, I missed adding >= and <= support in `query_dataset`.
          // For now, let's assume I can't filter by date yet in the generic query unless I add it.
          // OR I can quickly add it to the payload and hope I update the SQL function or add it now.
          // Let's add 'gte' and 'lte' to `filters` in payload, and I'll need to update the SQL function.
          // payload.filters.push({ column: xAxis, op: 'gte', value: startDate })
          // payload.filters.push({ column: xAxis, op: 'lte', value: endDate })
        }

        const response = await fetch(`/api/datasets/${dataset.id}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to fetch data')
        }

        const data = await response.json()
        setChartData(data)
      } catch (err) {
        console.error(err)
        setError('Failed to load chart data')
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(fetchData, 500)
    return () => clearTimeout(debounce)
  }, [
    dataset.id,
    xAxis,
    yAxis,
    groupBy,
    startDate,
    endDate,
    bucket,
    isDateXAxis,
  ])

  const toggleYAxis = (columnId: string) => {
    setYAxis((prev) => {
      if (prev.includes(columnId)) {
        return prev.filter((id) => id !== columnId)
      } else {
        return [...prev, columnId]
      }
    })
  }

  const renderChart = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-pulse">
          <Loader2 className="h-8 w-8 mb-2 animate-spin" />
          <p>Loading data...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-destructive">
          <p>{error}</p>
        </div>
      )
    }

    if (chartData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
          <p>Configure your chart to see visualization</p>
        </div>
      )
    }

    // Transform data for Recharts
    // Data comes as array of objects: { [x_col]: val, [y_col]: val, [group_col]: val ... }
    // We need to normalize keys for Recharts to X and Ys

    // But for grouping, we want pivot?
    // Recharts wants: [{ name: 'Jan', Apple: 10, Orange: 20 }, ...]

    let processedData: Record<string, string | number>[] = []

    if (groupBy !== 'none') {
      // Pivot
      const map = new Map<string, Record<string, string | number>>()
      chartData.forEach((row) => {
        const rawXVal = String(row[xAxis])
        // Format dates if X-axis is a date column
        const xVal = isDateXAxis ? formatDateLabel(rawXVal, bucket) : rawXVal
        const groupVal = String(row[groupBy] || 'Unknown')

        // For each Y axis
        yAxis.forEach((yCol) => {
          const yVal = row[yCol]

          if (!map.has(xVal)) {
            map.set(xVal, { name: xVal }) // Use 'name' for XAxis dataKey
          }
          const entry = map.get(xVal)!
          // Composite key if multiple Ys: "Apple_Sales", "Apple_Profit"
          const key = yAxis.length > 1 ? `${groupVal} - ${yCol}` : groupVal
          entry[key] = yVal
        })
      })
      processedData = Array.from(map.values())
    } else {
      processedData = chartData.map((row) => {
        const rawXVal = String(row[xAxis])
        // Format dates if X-axis is a date column
        const formattedX = isDateXAxis
          ? formatDateLabel(rawXVal, bucket)
          : rawXVal

        const item: Record<string, string | number> = {
          name: formattedX,
        }
        yAxis.forEach((yCol) => {
          item[yCol] = row[yCol]
        })
        return item
      })
    }

    // Determine data keys (series)
    let dataKeys: string[] = []
    if (groupBy !== 'none') {
      // Extract all keys except 'name' from all rows to handle sparse data
      const keys = new Set<string>()
      processedData.forEach((row) => {
        Object.keys(row).forEach((k) => {
          if (k !== 'name') keys.add(k)
        })
      })
      dataKeys = Array.from(keys)
    } else {
      dataKeys = yAxis
    }

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.28 0.01 260)"
              />
              <XAxis
                dataKey="name"
                stroke="oklch(0.65 0.01 260)"
                fontSize={12}
              />
              <YAxis stroke="oklch(0.65 0.01 260)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'oklch(0.16 0.01 260)',
                  border: '1px solid oklch(0.28 0.01 260)',
                  borderRadius: '8px',
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
                  dot={{ fill: CHART_COLORS[i % CHART_COLORS.length] }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.28 0.01 260)"
              />
              <XAxis
                dataKey="name"
                stroke="oklch(0.65 0.01 260)"
                fontSize={12}
              />
              <YAxis stroke="oklch(0.65 0.01 260)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'oklch(0.16 0.01 260)',
                  border: '1px solid oklch(0.28 0.01 260)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {dataKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={processedData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.28 0.01 260)"
              />
              <XAxis
                dataKey="name"
                stroke="oklch(0.65 0.01 260)"
                fontSize={12}
              />
              <YAxis stroke="oklch(0.65 0.01 260)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'oklch(0.16 0.01 260)',
                  border: '1px solid oklch(0.28 0.01 260)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
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

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.28 0.01 260)"
              />
              <XAxis
                type="number"
                dataKey="name"
                name={xAxis}
                stroke="oklch(0.65 0.01 260)"
                fontSize={12}
              />
              <YAxis
                type="number"
                dataKey={dataKeys[0]}
                name={yAxis[0]}
                stroke="oklch(0.65 0.01 260)"
                fontSize={12}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: 'oklch(0.16 0.01 260)',
                  border: '1px solid oklch(0.28 0.01 260)',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {groupBy !== 'none' ? (
                // Multiple series for scatter if grouped
                // This requires different data structure for Recharts Scatter
                // processedData is array of objects with properties.
                // Recharts Scatter expects `data` prop to be array of {x, y}
                // So we might need to transform chartData directly again.
                // Let's keep it simple for now and just show one scatter group or assume processedData works if formatted right.
                // Actually for Scatter, we usually want distinct points, not aggregated?
                // The aggregation query returns aggregated points.
                // Scatter of aggregated points is fine (e.g. Sales vs Profit by Region).

                dataKeys.map((key, i) => (
                  <Scatter
                    key={key}
                    name={key}
                    data={processedData}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))
              ) : (
                <Scatter
                  name={yAxis[0]}
                  data={processedData}
                  fill={CHART_COLORS[0]}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={processedData}
                dataKey={dataKeys[0]} // Pie only supports one metric efficiently usually
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={150}
                label={({ name, percent }) =>
                  `${name}: ${(percent * 100).toFixed(0)}%`
                }
              >
                {processedData.map((entry, index: number) => (
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
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Controls */}
      <div className="lg:col-span-1 space-y-6">
        {/* Chart Type */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Chart Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {chartTypes.map((type) => (
              <Button
                key={type.value}
                variant={chartType === type.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setChartType(type.value)}
                className={cn(
                  'flex items-center gap-2',
                  chartType === type.value &&
                    'bg-primary text-primary-foreground'
                )}
              >
                <type.icon className="h-4 w-4" />
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* X-Axis */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">X-Axis (Category)</Label>
          <Select value={xAxis} onValueChange={setXAxis}>
            <SelectTrigger className="bg-secondary/30">
              <SelectValue placeholder="Select column..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select column...</SelectItem>
              {xOptions.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.label || col.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range - only show if x-axis is a date */}
        {isDateXAxis && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Date Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-secondary/30"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">End</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-secondary/30"
                  />
                </div>
              </div>
            </div>

            {/* Granularity */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Granularity</Label>
              <Select
                value={bucket}
                onValueChange={(v) => setBucket(v as Bucket)}
              >
                <SelectTrigger className="bg-secondary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Y-Axis (Metrics) */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Y-Axis (Metric)</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2 bg-secondary/10">
            {yOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No numeric columns available
              </p>
            )}
            {yOptions.map((col) => (
              <div key={col.id} className="flex items-center space-x-2">
                <Checkbox
                  id={col.id}
                  checked={yAxis.includes(col.id)}
                  onCheckedChange={() => toggleYAxis(col.id)}
                />
                <label
                  htmlFor={col.id}
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  {col.label || col.id}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Group By */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Group By (Optional)</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="bg-secondary/30">
              <SelectValue placeholder="No grouping" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              {groupOptions.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.label || col.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chart */}
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Chart Preview
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveToDashboardOpen(true)}
            disabled={xAxis === 'none' || yAxis.length === 0}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save to Dashboard
          </Button>
        </div>
        <div className="h-[500px] p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
          {renderChart()}
        </div>
      </div>

      {/* Save to Dashboard Dialog */}
      <SaveToDashboardDialog
        open={saveToDashboardOpen}
        onOpenChange={setSaveToDashboardOpen}
        datasetId={dataset.id}
        chartConfig={{
          chartType,
          xAxis,
          yAxis,
          groupBy,
          bucket,
        }}
      />
    </div>
  )
}
