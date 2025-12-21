'use client'

import { useState, useMemo } from 'react'
import type { DashboardPanelWithDataset, ColumnSchema } from '@/lib/types'
import { Navigation } from '@/components/ui/navigation'
import { PanelGrid } from '@/components/dashboard/panel-grid'
import { AddPanelDialog } from '@/components/dashboard/add-panel-dialog'
import { EditPanelDialog } from '@/components/dashboard/edit-panel-dialog'
import { FilterBar } from '@/components/dashboard/dashboard-filters'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, Plus, Loader2, Database } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { ChartRenderer } from '@/components/dashboard/chart-renderer'
import {
  useDashboardQuery,
  useDeletePanelMutation,
  useChartDataQuery,
  useDashboardFilters,
  useColumnValuesQuery,
  type ChartQueryConfig,
} from '@dataforge/query-hooks'

export default function DashboardViewPage() {
  const params = useParams()
  const dashboardId = params.id as string
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [editingPanel, setEditingPanel] =
    useState<DashboardPanelWithDataset | null>(null)
  const [deletingPanelId, setDeletingPanelId] = useState<string | null>(null)
  const [expandedPanel, setExpandedPanel] =
    useState<DashboardPanelWithDataset | null>(null)

  // TanStack Query for dashboard data (now includes panels with their datasets)
  const { data: dashboard, isLoading: dashboardLoading } = useDashboardQuery(
    dashboardId,
    {
      enabled: isAuthenticated && !authLoading,
    }
  )

  // Get unique datasets used by panels for display
  // Must be before early returns to follow React hooks rules
  const uniqueDatasets = useMemo(() => {
    if (!dashboard) return []
    const datasetMap = new Map<
      string,
      { id: string; name: string; schema: ColumnSchema[] | null }
    >()
    dashboard.panels.forEach((panel) => {
      if (!datasetMap.has(panel.datasetId)) {
        datasetMap.set(panel.datasetId, {
          id: panel.datasetId,
          name: panel.dataset.name,
          schema: panel.dataset.canonicalSchema,
        })
      }
    })
    return Array.from(datasetMap.values())
  }, [dashboard])

  // Compute a merged schema from all datasets for global filters
  // Only include columns that exist in ALL datasets with the same type
  const mergedSchema = useMemo((): ColumnSchema[] => {
    if (uniqueDatasets.length === 0) return []
    if (uniqueDatasets.length === 1) {
      return uniqueDatasets[0].schema || []
    }

    // Find columns common to all datasets
    const allSchemas = uniqueDatasets
      .map((d) => d.schema || [])
      .filter((s) => s.length > 0)

    if (allSchemas.length === 0) return []

    // Start with first schema and filter to only columns in all others
    const firstSchema = allSchemas[0]
    return firstSchema.filter((col) => {
      return allSchemas.every((schema) =>
        schema.some((c) => c.id === col.id && c.type === col.type)
      )
    })
  }, [uniqueDatasets])

  // Get dimension columns for filter dropdowns
  const dimensionColumns = useMemo(() => {
    return mergedSchema
      .filter((col) => col.role === 'dimension' && col.type === 'string')
      .map((col) => col.id)
  }, [mergedSchema])

  // For column values, we need to pick one dataset to query
  // Use the first dataset that has panels
  const primaryDatasetId = uniqueDatasets[0]?.id ?? ''

  // Fetch unique values for dimension columns from primary dataset
  const { data: columnValues = {}, isLoading: valuesLoading } =
    useColumnValuesQuery(primaryDatasetId, dimensionColumns, {
      enabled: !!primaryDatasetId && dimensionColumns.length > 0,
    })

  // Dashboard filters hook
  const {
    filters: globalFilters,
    setFilter,
    removeFilter,
    clearFilters,
    resetToDefaults,
    saveAsDefaults,
    hasChanges: filtersChanged,
    isSaving: filtersSaving,
    mergeWithPanelFilters,
  } = useDashboardFilters({
    dashboard,
    schema: mergedSchema,
    syncToUrl: true,
  })

  // Delete panel mutation with optimistic updates
  const deletePanelMutation = useDeletePanelMutation({
    onSuccess: () => {
      setDeletingPanelId(null)
      toast.success('Panel deleted')
    },
    onError: () => {
      toast.error('Failed to delete panel')
    },
  })

  const isLoading = authLoading || dashboardLoading

  const handleDeletePanel = () => {
    if (!deletingPanelId) return
    deletePanelMutation.mutate({ dashboardId, panelId: deletingPanelId })
  }

  // Query config for expanded panel (includes global filters)
  const expandedQueryConfig = useMemo((): ChartQueryConfig | null => {
    if (!expandedPanel) return null
    // Merge global filters with panel-specific filters
    const mergedFilters = mergeWithPanelFilters(expandedPanel.config.filters)
    return {
      x: { column: expandedPanel.config.xAxis },
      y: expandedPanel.config.yAxis.map((col) => ({
        column: col,
        aggregation: expandedPanel.config.aggregation || 'sum',
      })),
      groupBy: expandedPanel.config.groupBy || undefined,
      bucket: expandedPanel.config.bucket || undefined,
      filters: mergedFilters,
      limit: expandedPanel.config.limit,
      sortBy: expandedPanel.config.sortBy,
    }
  }, [expandedPanel, mergeWithPanelFilters])

  // Query for expanded panel data (uses the panel's own dataset)
  const { data: expandedData = [] } = useChartDataQuery(
    expandedPanel?.datasetId ?? '',
    expandedQueryConfig!,
    {
      enabled: !!expandedPanel && !!expandedQueryConfig,
    }
  )

  const handleExpandPanel = (panel: DashboardPanelWithDataset) => {
    setExpandedPanel(panel)
  }

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <Navigation />
          <div className="flex justify-center pt-32">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!dashboard) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <Navigation />
          <main className="pt-24 px-6">
            <div className="mx-auto max-w-6xl text-center">
              <p className="text-muted-foreground mb-4">Dashboard not found</p>
              <Link href="/dashboard">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboards
                </Button>
              </Link>
            </div>
          </main>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Background Pattern */}
        <div className="fixed inset-0 grid-pattern opacity-50 pointer-events-none" />

        {/* Gradient Orb */}
        <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

        <Navigation />

        <main className="relative pt-24 pb-16 px-6">
          <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="mb-6">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="-ml-2 mb-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboards
                </Button>
              </Link>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {dashboard.name}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                    {uniqueDatasets.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Database className="h-4 w-4" />
                        <span>
                          {uniqueDatasets.length === 1
                            ? uniqueDatasets[0].name
                            : `${uniqueDatasets.length} datasets`}
                        </span>
                      </div>
                    )}
                    <span>•</span>
                    <span>{dashboard.panels.length} panels</span>
                  </div>
                  {dashboard.description && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {dashboard.description}
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => setAddPanelOpen(true)}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Panel
                </Button>
              </div>
            </div>

            {/* Global Filters */}
            {mergedSchema.length > 0 && (
              <FilterBar
                schema={mergedSchema}
                filters={globalFilters}
                onSetFilter={setFilter}
                onRemoveFilter={removeFilter}
                onClearFilters={clearFilters}
                onResetToDefaults={resetToDefaults}
                onSaveAsDefaults={async () => {
                  try {
                    await saveAsDefaults()
                    toast.success('Default filters saved')
                  } catch {
                    toast.error('Failed to save filters')
                  }
                }}
                hasChanges={filtersChanged}
                isSaving={filtersSaving}
                columnValues={columnValues}
                isLoadingValues={valuesLoading}
                className="mb-6"
              />
            )}

            {/* Panels Grid */}
            {dashboard.panels.length === 0 ? (
              <div className="flex flex-col items-center py-20 border-2 border-dashed border-border/50 rounded-xl bg-card/30">
                <p className="text-muted-foreground mb-4">
                  No panels yet. Add your first chart!
                </p>
                <Button onClick={() => setAddPanelOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Panel
                </Button>
              </div>
            ) : (
              <PanelGrid
                panels={dashboard.panels}
                globalFilters={globalFilters}
                onEditPanel={setEditingPanel}
                onDeletePanel={setDeletingPanelId}
                onExpandPanel={handleExpandPanel}
              />
            )}
          </div>
        </main>

        {/* Add Panel Dialog */}
        <AddPanelDialog
          open={addPanelOpen}
          onOpenChange={setAddPanelOpen}
          dashboardId={dashboardId}
          defaultDatasetId={dashboard.datasetId}
        />

        {/* Edit Panel Dialog */}
        {editingPanel && (
          <EditPanelDialog
            open={!!editingPanel}
            onOpenChange={(open) => !open && setEditingPanel(null)}
            panel={editingPanel}
          />
        )}

        {/* Delete Panel Confirmation */}
        <AlertDialog
          open={!!deletingPanelId}
          onOpenChange={() => setDeletingPanelId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Panel?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this panel from the dashboard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePanel}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Expanded Panel Dialog */}
        <Dialog
          open={!!expandedPanel}
          onOpenChange={() => {
            setExpandedPanel(null)
          }}
        >
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                {expandedPanel?.title}
                {expandedPanel && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({expandedPanel.dataset.name})
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 h-full pt-4">
              {expandedPanel && (
                <ChartRenderer
                  data={expandedData}
                  config={expandedPanel.config}
                  height="100%"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  )
}
