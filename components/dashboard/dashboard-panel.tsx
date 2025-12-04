'use client'

import { useState, useEffect } from 'react'
import type { DashboardPanel, Dataset } from '@/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2, Maximize2, Loader2 } from 'lucide-react'
import { ChartRenderer } from './chart-renderer'

interface DashboardPanelComponentProps {
  panel: DashboardPanel
  dataset: Dataset
  onEdit: (panel: DashboardPanel) => void
  onDelete: (panelId: string) => void
  onExpand: (panel: DashboardPanel) => void
}

export function DashboardPanelComponent({
  panel,
  dataset,
  onEdit,
  onDelete,
  onExpand,
}: DashboardPanelComponentProps) {
  const [chartData, setChartData] = useState<Record<string, any>[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/datasets/${dataset.id}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x: {
              column: panel.config.xAxis,
              bucket: panel.config.bucket || 'none',
            },
            y: panel.config.yAxis.map((col) => ({
              column: col,
              agg: panel.config.aggregation || 'sum',
            })),
            groupBy: panel.config.groupBy
              ? [{ column: panel.config.groupBy }]
              : [],
            filters: panel.config.filters || [],
          }),
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to fetch data')
        }

        const data = await response.json()
        setChartData(data)
      } catch (err) {
        console.error('Panel data fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    if (panel.config.xAxis && panel.config.yAxis.length > 0) {
      fetchData()
    } else {
      setIsLoading(false)
      setError('Invalid chart configuration')
    }
  }, [dataset.id, panel.config])

  return (
    <Card className="h-full flex flex-col group">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-medium truncate pr-2">
          {panel.title}
        </CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Panel actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExpand(panel)}>
              <Maximize2 className="h-4 w-4 mr-2" />
              Expand
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(panel)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(panel.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex-1 pt-0 pb-4">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-destructive text-sm text-center px-4">
            {error}
          </div>
        ) : (
          <ChartRenderer data={chartData} config={panel.config} height="100%" />
        )}
      </CardContent>
    </Card>
  )
}


