'use client'

import { useState, useMemo } from 'react'
import type {
  ChartConfig,
  ChartType,
  BlendMode,
  NormalizationMode,
  DerivedColumnType,
} from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  Plus,
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart as ScatterIcon,
  Database,
  Table2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAddPanelMutation, useDatasetsQuery } from '@dataforge/query-hooks'

interface AddPanelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
  /** Optional default dataset to pre-select */
  defaultDatasetId?: string | null
}

const chartTypes: {
  value: ChartType
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'line', label: 'Line', icon: LineChart },
  { value: 'area', label: 'Area', icon: AreaChart },
  { value: 'pie', label: 'Pie', icon: PieChart },
  { value: 'scatter', label: 'Scatter', icon: ScatterIcon },
  { value: 'table', label: 'Table', icon: Table2 },
]

// Derived column options that can be computed from date columns
const DERIVED_X_OPTIONS: {
  id: DerivedColumnType
  label: string
  description: string
}[] = [
  {
    id: 'day_of_week_name',
    label: 'Day of Week',
    description: 'Monday, Tuesday, etc.',
  },
  {
    id: 'day_of_week_short',
    label: 'Day of Week (short)',
    description: 'Mon, Tue, etc.',
  },
  { id: 'month_name', label: 'Month', description: 'January, February, etc.' },
  { id: 'month_short', label: 'Month (short)', description: 'Jan, Feb, etc.' },
  { id: 'quarter_label', label: 'Quarter', description: 'Q1, Q2, Q3, Q4' },
  { id: 'year', label: 'Year', description: '2024, 2025, etc.' },
  {
    id: 'year_month',
    label: 'Year-Month',
    description: '2024-01, 2024-02, etc.',
  },
  { id: 'week_of_year', label: 'Week of Year', description: 'Week 1-53' },
  { id: 'hour', label: 'Hour of Day', description: '0-23' },
]

export function AddPanelDialog({
  open,
  onOpenChange,
  dashboardId,
  defaultDatasetId,
}: AddPanelDialogProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    defaultDatasetId || ''
  )
  const [title, setTitle] = useState('')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [xAxis, setXAxis] = useState('')
  // Derived X-axis support (e.g., Day of Week from Date column)
  const [xAxisDerived, setXAxisDerived] = useState<DerivedColumnType | null>(
    null
  )
  const [xAxisSourceColumn, setXAxisSourceColumn] = useState<string>('')
  const [yAxis, setYAxis] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState<string>('none')
  // Top N / Sorting options
  const [limit, setLimit] = useState<number | undefined>(undefined)
  const [sortByColumn, setSortByColumn] = useState<string>('none')
  const [sortByDirection, setSortByDirection] = useState<'asc' | 'desc'>('desc')
  // Layout options
  const [isStacked, setIsStacked] = useState(false)
  const [isHorizontal, setIsHorizontal] = useState(false)
  // Donut mode
  const [isDonut, setIsDonut] = useState(false)
  // Data labels on bars
  const [showDataLabels, setShowDataLabels] = useState(false)
  // Dual Y-axis
  const [yAxisRight, setYAxisRight] = useState<string[]>([])
  // Multi-dataset blending
  const [blendedDatasetIds, setBlendedDatasetIds] = useState<string[]>([])
  const [blendMode, setBlendMode] = useState<BlendMode>('aggregate')
  // Normalization (percent-of-total)
  const [normalizeTo, setNormalizeTo] = useState<NormalizationMode>('none')

  // Fetch all datasets for the dropdown
  const { data: datasets = [], isLoading: datasetsLoading } = useDatasetsQuery(
    {},
    {
      enabled: open,
    }
  )

  // Get the selected dataset
  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  )

  const addPanelMutation = useAddPanelMutation({
    onSuccess: () => {
      toast.success('Panel added successfully')
      resetForm()
      onOpenChange(false)
    },
    onError: (error) => {
      const errorData = error.response?.data as { error?: string } | undefined
      toast.error(errorData?.error || error.message || 'Failed to add panel')
    },
  })

  // Find datasets with compatible schemas (share at least some columns)
  const compatibleDatasets = useMemo(() => {
    if (!selectedDataset) return []
    const primarySchema = selectedDataset.canonicalSchema || []
    if (primarySchema.length === 0) return []

    const primaryColumnIds = new Set(primarySchema.map((c) => c.id))

    return datasets.filter((ds) => {
      // Exclude the primary dataset
      if (ds.id === selectedDatasetId) return false
      const otherSchema = ds.canonicalSchema || []
      // Check if at least 2 columns match (to be useful for blending)
      const matchingCols = otherSchema.filter(
        (c) =>
          primaryColumnIds.has(c.id) &&
          primarySchema.find((p) => p.id === c.id)?.type === c.type
      )
      return matchingCols.length >= 2
    })
  }, [selectedDataset, selectedDatasetId, datasets])

  // Compute the intersection schema when blending
  const schema = useMemo(() => {
    if (!selectedDataset) return []
    const primarySchema = selectedDataset.canonicalSchema || []
    if (blendedDatasetIds.length === 0) return primarySchema

    const otherSchemas = blendedDatasetIds
      .map((id) => datasets.find((d) => d.id === id)?.canonicalSchema || [])
      .filter((s) => s.length > 0)
    if (otherSchemas.length === 0) return primarySchema

    return primarySchema.filter((col) =>
      otherSchemas.every((s) =>
        s.some((c) => c.id === col.id && c.type === col.type)
      )
    )
  }, [selectedDataset, blendedDatasetIds, datasets])

  // Filter columns based on chart type
  const { xOptions, yOptions, groupOptions, dateColumns } = useMemo(() => {
    const dimensions = schema.filter((c) => c.role === 'dimension')
    const metrics = schema.filter((c) => c.type === 'number')
    const dateOrNumeric = schema.filter(
      (c) => c.type === 'date' || c.type === 'number'
    )
    const dates = schema.filter((c) => c.type === 'date')
    const allColumns = schema

    switch (chartType) {
      case 'line':
      case 'area':
        return {
          xOptions: dateOrNumeric,
          yOptions: metrics,
          groupOptions: dimensions,
          dateColumns: dates,
        }
      case 'scatter':
        return {
          xOptions: metrics,
          yOptions: metrics,
          groupOptions: dimensions,
          dateColumns: dates,
        }
      case 'table':
        // For tables, all columns can be selected
        return {
          xOptions: allColumns, // X-axis becomes "columns to show"
          yOptions: allColumns,
          groupOptions: [],
          dateColumns: dates,
        }
      case 'bar':
      case 'pie':
      default:
        return {
          xOptions: dimensions,
          yOptions: metrics,
          groupOptions: dimensions,
          dateColumns: dates,
        }
    }
  }, [chartType, schema])

  // Show advanced options for certain chart types
  const showLimitSort = ['bar', 'line', 'area', 'table'].includes(chartType)
  const showStackedOption = chartType === 'bar'
  const showHorizontalOption = chartType === 'bar'
  const showDonutOption = chartType === 'pie'
  const showDualYAxis =
    ['bar', 'line', 'area'].includes(chartType) && yAxis.length > 1

  const handleSave = () => {
    if (!selectedDatasetId) {
      toast.error('Please select a dataset')
      return
    }
    if (!title.trim()) {
      toast.error('Please enter a panel title')
      return
    }
    if (!xAxis && chartType !== 'table') {
      toast.error('Please select an X-axis')
      return
    }
    // Validate derived column has source
    if (xAxisDerived && !xAxisSourceColumn) {
      toast.error('Please select a source date column')
      return
    }
    if (yAxis.length === 0 && chartType !== 'table') {
      toast.error('Please select at least one Y-axis metric')
      return
    }

    const config: ChartConfig = {
      chartType,
      xAxis,
      yAxis,
      groupBy: groupBy !== 'none' ? groupBy : null,
      // Derived X-axis (e.g., Day of Week from Date)
      ...(xAxisDerived &&
        xAxisSourceColumn && {
          xAxisDerived,
          xAxisSourceColumn,
        }),
      // Bar chart options
      ...(showStackedOption && isStacked && { stacked: true }),
      ...(showHorizontalOption &&
        isHorizontal && { layout: 'horizontal' as const }),
      // Data labels on bars
      ...(chartType === 'bar' && showDataLabels && { showDataLabels: true }),
      // Top N / Sorting options
      ...(limit && limit > 0 && { limit }),
      ...(sortByColumn !== 'none' && {
        sortBy: { column: sortByColumn, direction: sortByDirection },
      }),
      // Donut option (inner radius)
      ...(showDonutOption && isDonut && { innerRadius: 50 }),
      // Dual Y-axis
      ...(yAxisRight.length > 0 && { yAxisRight }),
      // Multi-dataset blending
      ...(blendedDatasetIds.length > 0 && {
        datasetIds: [selectedDatasetId, ...blendedDatasetIds],
        blendMode,
      }),
      // Normalization to percentages
      ...(normalizeTo !== 'none' && { normalizeTo }),
    }

    addPanelMutation.mutate({
      dashboardId,
      datasetId: selectedDatasetId,
      title: title.trim(),
      config,
    })
  }

  const resetForm = () => {
    setSelectedDatasetId(defaultDatasetId || '')
    setTitle('')
    setChartType('bar')
    setXAxis('')
    setXAxisDerived(null)
    setXAxisSourceColumn('')
    setYAxis([])
    setGroupBy('none')
    setLimit(undefined)
    setSortByColumn('none')
    setSortByDirection('desc')
    setIsStacked(false)
    setIsHorizontal(false)
    setIsDonut(false)
    setShowDataLabels(false)
    setYAxisRight([])
    setBlendedDatasetIds([])
    setBlendMode('aggregate')
    setNormalizeTo('none')
  }

  // Reset chart config when dataset changes
  const handleDatasetChange = (datasetId: string) => {
    setSelectedDatasetId(datasetId)
    setXAxis('')
    setXAxisDerived(null)
    setXAxisSourceColumn('')
    setYAxis([])
    setGroupBy('none')
    setLimit(undefined)
    setSortByColumn('none')
    setYAxisRight([])
    setBlendedDatasetIds((prev) => prev.filter((id) => id !== datasetId))
  }

  const toggleYAxis = (columnId: string) => {
    setYAxis((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    )
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  // Reset selections when chart type changes
  const handleChartTypeChange = (type: ChartType) => {
    setChartType(type)
    setXAxis('')
    setXAxisDerived(null)
    setXAxisSourceColumn('')
    setYAxis([])
    setGroupBy('none')
    setLimit(undefined)
    setSortByColumn('none')
    setIsStacked(false)
    setIsHorizontal(false)
    setIsDonut(false)
    setShowDataLabels(false)
    setYAxisRight([])
    setNormalizeTo('none')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90%] overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>Add Panel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Dataset Selection */}
          <div className="space-y-2">
            <Label>Dataset</Label>
            <Select
              value={selectedDatasetId}
              onValueChange={handleDatasetChange}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    datasetsLoading ? 'Loading...' : 'Select a dataset...'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    <div className="flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{ds.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({ds.rowCount.toLocaleString()} rows)
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Multi-Dataset Blending */}
          {selectedDatasetId && compatibleDatasets.length > 0 && (
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Combine with Other Datasets
                </Label>
                {blendedDatasetIds.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {blendedDatasetIds.length + 1} datasets selected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select additional datasets with compatible schemas to blend data
                across multiple sources (e.g., multiple stores).
              </p>

              {/* Dataset Selection */}
              <div className="space-y-2 max-h-28 overflow-y-auto">
                {compatibleDatasets.map((ds) => (
                  <div key={ds.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`blend-${ds.id}`}
                      checked={blendedDatasetIds.includes(ds.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setBlendedDatasetIds((prev) => [...prev, ds.id])
                        } else {
                          setBlendedDatasetIds((prev) =>
                            prev.filter((id) => id !== ds.id)
                          )
                        }
                      }}
                    />
                    <label
                      htmlFor={`blend-${ds.id}`}
                      className="text-sm cursor-pointer flex-1 flex items-center gap-2"
                    >
                      <Database className="h-3 w-3 text-muted-foreground" />
                      {ds.name}
                      <span className="text-xs text-muted-foreground">
                        ({ds.rowCount.toLocaleString()} rows)
                      </span>
                    </label>
                  </div>
                ))}
              </div>

              {/* Blend Mode Selection */}
              {blendedDatasetIds.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs">Blend Mode</Label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="blendMode"
                        value="aggregate"
                        checked={blendMode === 'aggregate'}
                        onChange={() => setBlendMode('aggregate')}
                        className="accent-primary mt-0.5"
                      />
                      <div>
                        <span className="font-medium">Aggregate</span>
                        <p className="text-xs text-muted-foreground">
                          Sum values across all datasets (e.g., total sales
                          across all stores)
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="blendMode"
                        value="separate"
                        checked={blendMode === 'separate'}
                        onChange={() => setBlendMode('separate')}
                        className="accent-primary mt-0.5"
                      />
                      <div>
                        <span className="font-medium">
                          Separate (by Source)
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Keep data separate with each dataset as a series
                          (e.g., stacked bar by store)
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Panel Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Panel Title</Label>
            <Input
              id="title"
              placeholder="e.g., Sales by Region"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!selectedDatasetId}
            />
          </div>

          {/* Chart Type */}
          <div className="space-y-2">
            <Label>Chart Type</Label>
            <div className="grid grid-cols-5 gap-2">
              {chartTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={chartType === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChartTypeChange(type.value)}
                  disabled={!selectedDatasetId}
                  className={cn(
                    'flex flex-col items-center gap-1 h-auto py-2',
                    chartType === type.value &&
                      'bg-primary text-primary-foreground'
                  )}
                >
                  <type.icon className="h-4 w-4" />
                  <span className="text-xs">{type.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* X-Axis */}
          <div className="space-y-2">
            <Label>X-Axis (Category)</Label>
            <Select
              value={xAxisDerived ? `derived:${xAxisDerived}` : xAxis}
              onValueChange={(val) => {
                if (val.startsWith('derived:')) {
                  const derivedType = val.replace(
                    'derived:',
                    ''
                  ) as DerivedColumnType
                  setXAxisDerived(derivedType)
                  // Use derived type as the xAxis name for display
                  setXAxis(derivedType)
                  // Auto-select first date column if only one
                  if (dateColumns.length === 1) {
                    setXAxisSourceColumn(dateColumns[0].id)
                  }
                } else {
                  setXAxisDerived(null)
                  setXAxisSourceColumn('')
                  setXAxis(val)
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                {/* Regular columns */}
                {xOptions.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.label || col.id}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({col.type})
                    </span>
                  </SelectItem>
                ))}
                {/* Derived columns (only if date columns exist) */}
                {dateColumns.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-2">
                      Computed from Date
                    </div>
                    {DERIVED_X_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={`derived:${opt.id}`}>
                        {opt.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({opt.description})
                        </span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Source Date Column (when derived X-axis is selected) */}
          {xAxisDerived && dateColumns.length > 1 && (
            <div className="space-y-2">
              <Label>Source Date Column</Label>
              <Select
                value={xAxisSourceColumn}
                onValueChange={setXAxisSourceColumn}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select date column..." />
                </SelectTrigger>
                <SelectContent>
                  {dateColumns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.label || col.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The date column to compute {xAxisDerived.replace(/_/g, ' ')}{' '}
                from
              </p>
            </div>
          )}

          {/* Y-Axis (Metrics) */}
          <div className="space-y-2">
            <Label>Y-Axis (Metrics)</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2 bg-secondary/10">
              {yOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No numeric columns available
                </p>
              ) : (
                yOptions.map((col) => (
                  <div key={col.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`y-${col.id}`}
                      checked={yAxis.includes(col.id)}
                      onCheckedChange={() => toggleYAxis(col.id)}
                    />
                    <label
                      htmlFor={`y-${col.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {col.label || col.id}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Group By */}
          {chartType !== 'table' && (
            <div className="space-y-2">
              <Label>Group By (Optional)</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue placeholder="No grouping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  {groupOptions
                    .filter((col) => col.id !== xAxis)
                    .map((col) => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.label || col.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Bar Chart Options */}
          {showStackedOption && (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="stacked"
                  checked={isStacked}
                  onCheckedChange={(checked) => setIsStacked(checked === true)}
                />
                <label htmlFor="stacked" className="text-sm cursor-pointer">
                  Stacked bars
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="horizontal"
                  checked={isHorizontal}
                  onCheckedChange={(checked) =>
                    setIsHorizontal(checked === true)
                  }
                />
                <label htmlFor="horizontal" className="text-sm cursor-pointer">
                  Horizontal layout
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dataLabels"
                  checked={showDataLabels}
                  onCheckedChange={(checked) =>
                    setShowDataLabels(checked === true)
                  }
                />
                <label htmlFor="dataLabels" className="text-sm cursor-pointer">
                  Show values
                </label>
              </div>
            </div>
          )}

          {/* Normalization (percent view) */}
          {['bar', 'pie'].includes(chartType) && (
            <div className="space-y-2">
              <Label>Normalization</Label>
              <div className="flex items-center gap-4">
                {[
                  { value: 'none', label: 'None' },
                  { value: 'row', label: '100% per category' },
                  { value: 'all', label: 'Share of total' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="normalize"
                      value={opt.value}
                      checked={normalizeTo === opt.value}
                      onChange={() =>
                        setNormalizeTo(opt.value as typeof normalizeTo)
                      }
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Use 100% per category for stacked percent bars; share of total
                shows each bar as percent of the grand total.
              </p>
            </div>
          )}

          {/* Donut Option for Pie Charts */}
          {showDonutOption && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="donut"
                checked={isDonut}
                onCheckedChange={(checked) => setIsDonut(checked === true)}
              />
              <label htmlFor="donut" className="text-sm cursor-pointer">
                Donut style (hollow center)
              </label>
            </div>
          )}

          {/* Top N / Sorting Options */}
          {showLimitSort && (
            <div className="space-y-3 border-t pt-3">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Top N / Sorting
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="limit" className="text-xs">
                    Limit Results
                  </Label>
                  <Input
                    id="limit"
                    type="number"
                    min={1}
                    max={100}
                    placeholder="e.g., 10"
                    value={limit || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      setLimit(val ? parseInt(val, 10) : undefined)
                    }}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sort By</Label>
                  <Select value={sortByColumn} onValueChange={setSortByColumn}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (default)</SelectItem>
                      {yAxis.map((col) => (
                        <SelectItem key={col} value={col}>
                          {schema.find((c) => c.id === col)?.label || col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {sortByColumn !== 'none' && (
                <div className="flex items-center gap-4">
                  <Label className="text-xs">Direction:</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="sortDir"
                        checked={sortByDirection === 'desc'}
                        onChange={() => setSortByDirection('desc')}
                        className="accent-primary"
                      />
                      Top (highest first)
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="sortDir"
                        checked={sortByDirection === 'asc'}
                        onChange={() => setSortByDirection('asc')}
                        className="accent-primary"
                      />
                      Bottom (lowest first)
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dual Y-Axis */}
          {showDualYAxis && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Dual Y-Axis (Right Axis)
              </Label>
              <p className="text-xs text-muted-foreground">
                Select metrics to plot on the right Y-axis
              </p>
              <div className="space-y-2 max-h-24 overflow-y-auto border rounded-md p-2 bg-secondary/10">
                {yAxis.map((col) => (
                  <div key={col} className="flex items-center space-x-2">
                    <Checkbox
                      id={`yright-${col}`}
                      checked={yAxisRight.includes(col)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setYAxisRight((prev) => [...prev, col])
                        } else {
                          setYAxisRight((prev) => prev.filter((c) => c !== col))
                        }
                      }}
                    />
                    <label
                      htmlFor={`yright-${col}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {schema.find((c) => c.id === col)?.label || col} → Right
                      Axis
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              addPanelMutation.isPending ||
              !selectedDatasetId ||
              !title.trim() ||
              (chartType !== 'table' && !xAxis) ||
              (chartType !== 'table' && yAxis.length === 0)
            }
          >
            {addPanelMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add Panel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
