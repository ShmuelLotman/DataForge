'use client'

import { useMemo } from 'react'
import type { DashboardPanelWithDataset, ChartFilter } from '@/lib/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreVertical,
  Pencil,
  Trash2,
  Maximize2,
  Loader2,
  Database,
} from 'lucide-react'
import { ChartRenderer } from './chart-renderer'
import {
  useChartDataQuery,
  type ChartQueryConfig,
} from '@dataforge/query-hooks'

interface DashboardPanelComponentProps {
  panel: DashboardPanelWithDataset
  /** Global filters to merge with panel-specific filters */
  globalFilters?: ChartFilter[]
  onEdit: (panel: DashboardPanelWithDataset) => void
  onDelete: (panelId: string) => void
  onExpand: (panel: DashboardPanelWithDataset) => void
}

export function DashboardPanelComponent({
  panel,
  globalFilters = [],
  onEdit,
  onDelete,
  onExpand,
}: DashboardPanelComponentProps) {
  // Panel now includes its own dataset info
  const { dataset } = panel

  // Get column IDs from this panel's dataset schema
  const datasetColumnIds = useMemo(() => {
    const schema = dataset.canonicalSchema || []
    return new Set(schema.map((col) => col.id))
  }, [dataset.canonicalSchema])

  // Serialize filters for stable dependency comparison
  const globalFiltersKey = JSON.stringify(globalFilters)
  const panelFiltersKey = JSON.stringify(panel.config.filters || [])
  const columnIdsKey = JSON.stringify([...datasetColumnIds])

  // Merge global filters with panel-specific filters
  // Only include global filters for columns that exist in this panel's dataset
  // Panel filters take precedence over global filters
  const mergedFilters = useMemo(() => {
    const panelFilters = panel.config.filters || []

    // Filter global filters to only those with columns in this dataset
    const applicableGlobalFilters = globalFilters.filter((f) =>
      datasetColumnIds.has(f.column)
    )

    if (!applicableGlobalFilters.length) return panelFilters

    const merged = [...applicableGlobalFilters]
    for (const pf of panelFilters) {
      const existingIdx = merged.findIndex((f) => f.column === pf.column)
      if (existingIdx >= 0) {
        merged[existingIdx] = pf // Panel filter overrides
      } else {
        merged.push(pf)
      }
    }
    return merged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFiltersKey, panelFiltersKey, columnIdsKey])

  // Serialize yAxis for stable dependency comparison
  const yAxisKey = JSON.stringify(panel.config.yAxis)
  const mergedFiltersKey = JSON.stringify(mergedFilters)

  // Memoize query config to prevent unnecessary refetches
  // TanStack Query uses deep comparison on query keys, so this ensures stable references
  const queryConfig = useMemo((): ChartQueryConfig | null => {
    if (!panel.config.xAxis || panel.config.yAxis.length === 0) {
      return null
    }

    return {
      x: { column: panel.config.xAxis },
      y: panel.config.yAxis.map((col) => ({
        column: col,
        aggregation: panel.config.aggregation || 'sum',
      })),
      groupBy: panel.config.groupBy || undefined,
      bucket: panel.config.bucket || undefined,
      filters: mergedFilters,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    panel.config.xAxis,
    yAxisKey,
    panel.config.aggregation,
    panel.config.groupBy,
    panel.config.bucket,
    mergedFiltersKey,
  ])

  const {
    data: chartData = [],
    isLoading,
    error: queryError,
  } = useChartDataQuery(dataset.id, queryConfig!, {
    enabled: !!queryConfig,
    // Keep data fresh for 5 minutes - panels don't need constant updates
    staleTime: 5 * 60 * 1000,
  })

  const error = queryError
    ? 'Failed to load data'
    : !queryConfig
    ? 'Invalid chart configuration'
    : null

  return (
    <Card className="h-full flex flex-col group">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <div className="flex-1 min-w-0 pr-2">
          <CardTitle className="text-base font-medium truncate">
            {panel.title}
          </CardTitle>
          <div className="flex items-center gap-1 mt-0.5">
            <Database className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">
              {dataset.name}
            </span>
          </div>
        </div>
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
