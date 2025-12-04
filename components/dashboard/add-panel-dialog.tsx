'use client'

import { useState, useMemo } from 'react'
import type { ChartConfig, Dataset, ChartType } from '@/lib/types'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAddPanelMutation } from '@dataforge/query-hooks'

interface AddPanelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
  dataset: Dataset
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

export function AddPanelDialog({
  open,
  onOpenChange,
  dashboardId,
  dataset,
}: AddPanelDialogProps) {
  const [title, setTitle] = useState('')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState<string>('none')

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

  const handleSave = () => {
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

    const config: ChartConfig = {
      chartType,
      xAxis,
      yAxis,
      groupBy: groupBy !== 'none' ? groupBy : null,
    }

    addPanelMutation.mutate({ dashboardId, title: title.trim(), config })
  }

  const resetForm = () => {
    setTitle('')
    setChartType('bar')
    setXAxis('')
    setYAxis([])
    setGroupBy('none')
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
    setYAxis([])
    setGroupBy('none')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Panel</DialogTitle>
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
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              addPanelMutation.isPending ||
              !title.trim() ||
              !xAxis ||
              yAxis.length === 0
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
