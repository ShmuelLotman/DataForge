'use client'

import { useState, useMemo, useEffect } from 'react'
import type {
  ChartConfig,
  ChartType,
  DashboardPanelWithDataset,
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
  Save,
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart as ScatterIcon,
  Database,
  Table2,
  Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useUpdatePanelMutation,
  useDatasetsQuery,
} from '@dataforge/query-hooks'

interface EditPanelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  panel: DashboardPanelWithDataset
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
  { value: 'kpi', label: 'KPI', icon: Hash },
  { value: 'table', label: 'Table', icon: Table2 },
]

// Format options for KPI display
const kpiFormatOptions: {
  value: 'number' | 'currency' | 'percent'
  label: string
}[] = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency ($)' },
  { value: 'percent', label: 'Percent (%)' },
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

export function EditPanelDialog({
  open,
  onOpenChange,
  panel,
}: EditPanelDialogProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState(panel.datasetId)
  const [title, setTitle] = useState(panel.title)
  const [chartType, setChartType] = useState<ChartType>(panel.config.chartType)
  const [xAxis, setXAxis] = useState(panel.config.xAxis)
  // Derived X-axis support
  const [xAxisDerived, setXAxisDerived] = useState<DerivedColumnType | null>(
    panel.config.xAxisDerived || null
  )
  const [xAxisSourceColumn, setXAxisSourceColumn] = useState<string>(
    panel.config.xAxisSourceColumn || ''
  )
  const [yAxis, setYAxis] = useState<string[]>(panel.config.yAxis)
  const [groupBy, setGroupBy] = useState<string>(panel.config.groupBy || 'none')
  // Top N / Sorting options
  const [limit, setLimit] = useState<number | undefined>(panel.config.limit)
  const [sortByColumn, setSortByColumn] = useState<string>(
    panel.config.sortBy?.column || 'none'
  )
  const [sortByDirection, setSortByDirection] = useState<'asc' | 'desc'>(
    panel.config.sortBy?.direction || 'desc'
  )
  // Layout options
  const [isStacked, setIsStacked] = useState(panel.config.stacked ?? false)
  const [isHorizontal, setIsHorizontal] = useState(
    panel.config.layout === 'horizontal'
  )
  // Donut mode
  const [isDonut, setIsDonut] = useState((panel.config.innerRadius ?? 0) > 0)
  // Data labels on bars
  const [showDataLabels, setShowDataLabels] = useState(
    panel.config.showDataLabels ?? false
  )
  // Dual Y-axis
  const [yAxisRight, setYAxisRight] = useState<string[]>(
    panel.config.yAxisRight || []
  )
  // Multi-dataset blending
  const [blendedDatasetIds, setBlendedDatasetIds] = useState<string[]>(() => {
    const ids = panel.config.datasetIds || panel.datasetIds || []
    // Exclude primary dataset
    return ids.filter((id) => id !== panel.datasetId)
  })
  const [blendMode, setBlendMode] = useState<BlendMode>(
    panel.config.blendMode || 'aggregate'
  )
  // Normalization
  const [normalizeTo, setNormalizeTo] = useState<NormalizationMode>(
    panel.config.normalizeTo || 'none'
  )
  // KPI options
  const [kpiFormat, setKpiFormat] = useState<'number' | 'currency' | 'percent'>(
    panel.config.format || 'number'
  )
  const [kpiLabel, setKpiLabel] = useState(panel.config.label || '')

  // Fetch all datasets for the dropdown
  const { data: datasets = [], isLoading: datasetsLoading } = useDatasetsQuery(
    {},
    {
      enabled: open,
    }
  )

  // Get the selected dataset (use panel.dataset if same ID, otherwise find from list)
  const selectedDataset = useMemo(() => {
    if (selectedDatasetId === panel.datasetId) {
      return panel.dataset
    }
    return datasets.find((d) => d.id === selectedDatasetId)
  }, [datasets, selectedDatasetId, panel.datasetId, panel.dataset])

  const updatePanelMutation = useUpdatePanelMutation({
    onSuccess: () => {
      toast.success('Panel updated successfully')
      onOpenChange(false)
    },
    onError: (error) => {
      const errorData = error.response?.data as { error?: string } | undefined
      toast.error(errorData?.error || error.message || 'Failed to update panel')
    },
  })

  // Reset form when dialog opens with a (potentially different) panel
  useEffect(() => {
    if (open) {
      setSelectedDatasetId(panel.datasetId)
      setTitle(panel.title)
      setChartType(panel.config.chartType)
      setXAxis(panel.config.xAxis)
      setXAxisDerived(panel.config.xAxisDerived || null)
      setXAxisSourceColumn(panel.config.xAxisSourceColumn || '')
      setYAxis(panel.config.yAxis)
      setGroupBy(panel.config.groupBy || 'none')
      setLimit(panel.config.limit)
      setSortByColumn(panel.config.sortBy?.column || 'none')
      setSortByDirection(panel.config.sortBy?.direction || 'desc')
      setIsStacked(panel.config.stacked ?? false)
      setIsHorizontal(panel.config.layout === 'horizontal')
      setIsDonut((panel.config.innerRadius ?? 0) > 0)
      setShowDataLabels(panel.config.showDataLabels ?? false)
      setYAxisRight(panel.config.yAxisRight || [])
      const ids = panel.config.datasetIds || panel.datasetIds || []
      setBlendedDatasetIds(ids.filter((id) => id !== panel.datasetId))
      setBlendMode(panel.config.blendMode || 'aggregate')
      setNormalizeTo(panel.config.normalizeTo || 'none')
      setKpiFormat(panel.config.format || 'number')
      setKpiLabel(panel.config.label || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panel.id])

  // Find compatible datasets
  const compatibleDatasets = useMemo(() => {
    if (!selectedDataset) return []
    const primarySchema = selectedDataset.canonicalSchema || []
    if (primarySchema.length === 0) return []

    const primaryColumnIds = new Set(primarySchema.map((c) => c.id))

    return datasets.filter((ds) => {
      if (ds.id === selectedDatasetId) return false
      const otherSchema = ds.canonicalSchema || []
      const matchingCols = otherSchema.filter(
        (c) =>
          primaryColumnIds.has(c.id) &&
          primarySchema.find((p) => p.id === c.id)?.type === c.type
      )
      return matchingCols.length >= 2
    })
  }, [selectedDataset, selectedDatasetId, datasets])

  // Compute intersection schema when blending
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

  // Inject _source as a virtual dimension when blending multiple datasets
  const schemaWithSource = useMemo(() => {
    if (blendedDatasetIds.length === 0) return schema
    // Inject _source as a virtual dimension column at the start
    return [
      {
        id: '_source',
        label: 'Source (Dataset)',
        type: 'string' as const,
        role: 'dimension' as const,
      },
      ...schema,
    ]
  }, [schema, blendedDatasetIds])

  // Filter columns based on chart type
  const { xOptions, yOptions, groupOptions, dateColumns } = useMemo(() => {
    const dimensions = schemaWithSource.filter((c) => c.role === 'dimension')
    const metrics = schemaWithSource.filter((c) => c.type === 'number')
    const dateOrNumeric = schemaWithSource.filter(
      (c) => c.type === 'date' || c.type === 'number'
    )
    const dates = schemaWithSource.filter((c) => c.type === 'date')
    const allColumns = schemaWithSource

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
        return {
          xOptions: allColumns,
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
  }, [chartType, schemaWithSource])

  // Show advanced options
  const showLimitSort = ['bar', 'line', 'area', 'table'].includes(chartType)
  const showStackedOption = chartType === 'bar'
  const showHorizontalOption = chartType === 'bar'
  const showDonutOption = chartType === 'pie'
  const showDualYAxis =
    ['bar', 'line', 'area'].includes(chartType) && yAxis.length > 1
  const isKpiType = chartType === 'kpi'

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Please enter a panel title')
      return
    }
    // KPI and table don't require x-axis
    const requiresXAxis = !['table', 'kpi'].includes(chartType)
    if (!xAxis && requiresXAxis) {
      toast.error('Please select an X-axis')
      return
    }
    // Validate derived column has source
    if (xAxisDerived && !xAxisSourceColumn) {
      toast.error('Please select a source date column')
      return
    }
    if (yAxis.length === 0 && chartType !== 'table') {
      toast.error('Please select at least one metric')
      return
    }

    const config: ChartConfig = {
      chartType,
      xAxis: chartType === 'kpi' ? '_kpi' : xAxis,
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
      // Top N / Sorting
      ...(limit && limit > 0 && { limit }),
      ...(sortByColumn !== 'none' && {
        sortBy: { column: sortByColumn, direction: sortByDirection },
      }),
      // Donut
      ...(showDonutOption && isDonut && { innerRadius: 50 }),
      // Dual Y-axis
      ...(yAxisRight.length > 0 && { yAxisRight }),
      // Multi-dataset blending
      ...(blendedDatasetIds.length > 0 && {
        datasetIds: [selectedDatasetId, ...blendedDatasetIds],
        blendMode,
      }),
      // Normalization
      ...(normalizeTo !== 'none' && { normalizeTo }),
      // KPI-specific options
      ...(chartType === 'kpi' && {
        format: kpiFormat,
        label: kpiLabel || yAxis[0],
        aggregation: 'sum' as const,
      }),
    }

    const datasetIdChanged = selectedDatasetId !== panel.datasetId

    updatePanelMutation.mutate({
      dashboardId: panel.dashboardId,
      panelId: panel.id,
      data: {
        title: title.trim(),
        config,
        ...(datasetIdChanged && { datasetId: selectedDatasetId }),
      },
    })
  }

  const toggleYAxis = (columnId: string) => {
    setYAxis((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    )
  }

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90%] overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>Edit Panel</DialogTitle>
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
                across multiple sources.
              </p>

              <div className="space-y-2 max-h-28 overflow-y-auto">
                {compatibleDatasets.map((ds) => (
                  <div key={ds.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-blend-${ds.id}`}
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
                      htmlFor={`edit-blend-${ds.id}`}
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

              {blendedDatasetIds.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs">Blend Mode</Label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="editBlendMode"
                        value="aggregate"
                        checked={blendMode === 'aggregate'}
                        onChange={() => setBlendMode('aggregate')}
                        className="accent-primary mt-0.5"
                      />
                      <div>
                        <span className="font-medium">Aggregate</span>
                        <p className="text-xs text-muted-foreground">
                          Sum values across all datasets
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="editBlendMode"
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
            <Label htmlFor="edit-title">Panel Title</Label>
            <Input
              id="edit-title"
              placeholder="e.g., Sales by Region"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Chart Type */}
          <div className="space-y-2">
            <Label>Chart Type</Label>
            <div className="grid grid-cols-6 gap-2">
              {chartTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={chartType === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleChartTypeChange(type.value)}
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

          {/* X-Axis (hidden for KPI) */}
          {!isKpiType && (
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
                    setXAxis(derivedType)
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
                  {/* Regular columns (includes _source when blending) */}
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
          )}

          {/* Source Date Column (when derived X-axis is selected) */}
          {!isKpiType && xAxisDerived && dateColumns.length > 1 && (
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

          {/* Y-Axis (Metrics) - for KPI, only allow single selection */}
          <div className="space-y-2">
            <Label>
              {isKpiType ? 'Metric to Display' : 'Y-Axis (Metrics)'}
            </Label>
            {isKpiType ? (
              <Select
                value={yAxis[0] || ''}
                onValueChange={(val) => setYAxis([val])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select metric..." />
                </SelectTrigger>
                <SelectContent>
                  {yOptions.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.label || col.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2 bg-secondary/10">
                {yOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No numeric columns available
                  </p>
                ) : (
                  yOptions.map((col) => (
                    <div key={col.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`y-edit-${col.id}`}
                        checked={yAxis.includes(col.id)}
                        onCheckedChange={() => toggleYAxis(col.id)}
                      />
                      <label
                        htmlFor={`y-edit-${col.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {col.label || col.id}
                      </label>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* KPI Options */}
          {isKpiType && (
            <div className="space-y-4 p-4 border rounded-lg bg-secondary/10">
              <div className="text-sm font-medium">KPI Display Options</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="kpi-format-edit">Format</Label>
                  <Select
                    value={kpiFormat}
                    onValueChange={(val) =>
                      setKpiFormat(val as typeof kpiFormat)
                    }
                  >
                    <SelectTrigger id="kpi-format-edit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {kpiFormatOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kpi-label-edit">Label (Optional)</Label>
                  <Input
                    id="kpi-label-edit"
                    value={kpiLabel}
                    onChange={(e) => setKpiLabel(e.target.value)}
                    placeholder={yAxis[0] || 'Total'}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                KPI displays a single aggregated value (sum) with optional
                formatting
              </p>
            </div>
          )}

          {/* Group By */}
          {chartType !== 'table' && !isKpiType && (
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
                  id="edit-stacked"
                  checked={isStacked}
                  onCheckedChange={(checked) => setIsStacked(checked === true)}
                />
                <label
                  htmlFor="edit-stacked"
                  className="text-sm cursor-pointer"
                >
                  Stacked bars
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-horizontal"
                  checked={isHorizontal}
                  onCheckedChange={(checked) =>
                    setIsHorizontal(checked === true)
                  }
                />
                <label
                  htmlFor="edit-horizontal"
                  className="text-sm cursor-pointer"
                >
                  Horizontal layout
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-dataLabels"
                  checked={showDataLabels}
                  onCheckedChange={(checked) =>
                    setShowDataLabels(checked === true)
                  }
                />
                <label
                  htmlFor="edit-dataLabels"
                  className="text-sm cursor-pointer"
                >
                  Show values
                </label>
              </div>
            </div>
          )}

          {/* Normalization */}
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
                      name="editNormalize"
                      value={opt.value}
                      checked={normalizeTo === opt.value}
                      onChange={() =>
                        setNormalizeTo(opt.value as NormalizationMode)
                      }
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Donut Option */}
          {showDonutOption && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-donut"
                checked={isDonut}
                onCheckedChange={(checked) => setIsDonut(checked === true)}
              />
              <label htmlFor="edit-donut" className="text-sm cursor-pointer">
                Donut style (hollow center)
              </label>
            </div>
          )}

          {/* Top N / Sorting */}
          {showLimitSort && (
            <div className="space-y-3 border-t pt-3">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                Top N / Sorting
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-limit" className="text-xs">
                    Limit Results
                  </Label>
                  <Input
                    id="edit-limit"
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
                        name="editSortDir"
                        checked={sortByDirection === 'desc'}
                        onChange={() => setSortByDirection('desc')}
                        className="accent-primary"
                      />
                      Top (highest first)
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="editSortDir"
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
              <div className="space-y-2 max-h-24 overflow-y-auto border rounded-md p-2 bg-secondary/10">
                {yAxis.map((col) => (
                  <div key={col} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-yright-${col}`}
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
                      htmlFor={`edit-yright-${col}`}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              updatePanelMutation.isPending ||
              !title.trim() ||
              (!['table', 'kpi'].includes(chartType) && !xAxis) ||
              (chartType !== 'table' && yAxis.length === 0)
            }
          >
            {updatePanelMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
