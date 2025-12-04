'use client'

import { useState, useEffect } from 'react'
import type { DashboardWithPanels, Dataset, DashboardPanel } from '@/lib/types'
import { Navigation } from '@/components/ui/navigation'
import { PanelGrid } from '@/components/dashboard/panel-grid'
import { AddPanelDialog } from '@/components/dashboard/add-panel-dialog'
import { EditPanelDialog } from '@/components/dashboard/edit-panel-dialog'
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
import { ArrowLeft, Plus, Loader2, Database, Rows3 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { ChartRenderer } from '@/components/dashboard/chart-renderer'

export default function DashboardViewPage() {
  const params = useParams()
  const dashboardId = params.id as string
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [dashboard, setDashboard] = useState<DashboardWithPanels | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [editingPanel, setEditingPanel] = useState<DashboardPanel | null>(null)
  const [deletingPanelId, setDeletingPanelId] = useState<string | null>(null)
  const [expandedPanel, setExpandedPanel] = useState<DashboardPanel | null>(
    null
  )
  const [expandedData, setExpandedData] = useState<Record<string, any>[]>([])

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchDashboard()
    } else if (!authLoading) {
      setIsLoading(false)
    }
  }, [dashboardId, isAuthenticated, authLoading])

  const fetchDashboard = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}`)
      if (!res.ok) throw new Error('Failed to fetch dashboard')
      const data: DashboardWithPanels = await res.json()
      setDashboard(data)

      // Fetch dataset details
      const datasetRes = await fetch(`/api/datasets/${data.datasetId}`)
      if (datasetRes.ok) {
        setDataset(await datasetRes.json())
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error)
      toast.error('Failed to load dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePanel = async () => {
    if (!deletingPanelId) return
    try {
      const res = await fetch(
        `/api/dashboards/${dashboardId}/panels/${deletingPanelId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to delete panel')
      setDeletingPanelId(null)
      fetchDashboard()
      toast.success('Panel deleted')
    } catch (error) {
      console.error('Error deleting panel:', error)
      toast.error('Failed to delete panel')
    }
  }

  const handleExpandPanel = async (panel: DashboardPanel) => {
    setExpandedPanel(panel)
    // Fetch data for expanded view
    try {
      const response = await fetch(`/api/datasets/${dataset?.id}/query`, {
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
      if (response.ok) {
        setExpandedData(await response.json())
      }
    } catch (error) {
      console.error('Error fetching expanded panel data:', error)
    }
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

  if (!dashboard || !dataset) {
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
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                    <div className="flex items-center gap-1.5">
                      <Database className="h-4 w-4" />
                      <span>{dataset.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Rows3 className="h-4 w-4" />
                      <span>{dataset.rowCount.toLocaleString()} rows</span>
                    </div>
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
                dataset={dataset}
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
          dataset={dataset}
          onAdded={fetchDashboard}
        />

        {/* Edit Panel Dialog */}
        {editingPanel && (
          <EditPanelDialog
            open={!!editingPanel}
            onOpenChange={(open) => !open && setEditingPanel(null)}
            panel={editingPanel}
            dataset={dataset}
            onUpdated={fetchDashboard}
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
            setExpandedData([])
          }}
        >
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>{expandedPanel?.title}</DialogTitle>
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

