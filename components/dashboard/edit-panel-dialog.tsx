'use client'

import { useState, useMemo, useEffect } from 'react'
import type { ChartConfig, Dataset, ChartType, DashboardPanel } from '@/lib/types'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface EditPanelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  panel: DashboardPanel
  dataset: Dataset
  onUpdated?: () => void
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
]

export function EditPanelDialog({
  open,
  onOpenChange,
  panel,
  dataset,
  onUpdated,
}: EditPanelDialogProps) {
  const [title, setTitle] = useState(panel.title)
  const [chartType, setChartType] = useState<ChartType>(panel.config.chartType)
  const [xAxis, setXAxis] = useState(panel.config.xAxis)
  const [yAxis, setYAxis] = useState<string[]>(panel.config.yAxis)
  const [groupBy, setGroupBy] = useState<string>(panel.config.groupBy || 'none')
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when panel changes
  useEffect(() => {
    setTitle(panel.title)
    setChartType(panel.config.chartType)
    setXAxis(panel.config.xAxis)
    setYAxis(panel.config.yAxis)
    setGroupBy(panel.config.groupBy || 'none')
  }, [panel])

  const schema = dataset.canonicalSchema || []

  // Filter columns based on chart type
  const { xOptions, yOptions, groupOptions } = useMemo(() => {
    const dimensions = schema.filter((c) => c.role === 'dimension')
    const metrics = schema.filter((c) => c.type === 'number')
    const dateOrNumeric = schema.filter(
      (c) => c.type === 'date' || c.type === 'number'
    )

    switch (chartType) {
      case 'line':
      case 'area':
        return {
          xOptions: dateOrNumeric,
          yOptions: metrics,
          groupOptions: dimensions,
        }
      case 'scatter':
        return {
          xOptions: metrics,
          yOptions: metrics,
          groupOptions: dimensions,
        }
      case 'bar':
      case 'pie':
      default:
        return {
          xOptions: dimensions,
          yOptions: metrics,
          groupOptions: dimensions,
        }
    }
  }, [chartType, schema])

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a panel title')
      return
    }
    if (!xAxis) {
      toast.error('Please select an X-axis')
      return
    }
    if (yAxis.length === 0) {
      toast.error('Please select at least one Y-axis metric')
      return
    }

    setIsSaving(true)
    try {
      const config: ChartConfig = {
        chartType,
        xAxis,
        yAxis,
        groupBy: groupBy !== 'none' ? groupBy : null,
      }

      const res = await fetch(
        `/api/dashboards/${panel.dashboardId}/panels/${panel.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), config }),
        }
      )

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update panel')
      }

      toast.success('Panel updated successfully')
      onOpenChange(false)
      onUpdated?.()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update panel'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleYAxis = (columnId: string) => {
    setYAxis((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    )
  }

  // Reset selections when chart type changes
  const handleChartTypeChange = (type: ChartType) => {
    setChartType(type)
    setXAxis('')
    setYAxis([])
    setGroupBy('none')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Panel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Panel Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Panel Title</Label>
            <Input
              id="title"
              placeholder="e.g., Sales by Region"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
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
            <Select value={xAxis} onValueChange={setXAxis}>
              <SelectTrigger>
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                {xOptions.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.label || col.id}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({col.type})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
          </div>

          {/* Group By */}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !xAxis || yAxis.length === 0}
          >
            {isSaving ? (
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

