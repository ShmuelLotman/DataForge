'use client'

import { useState, useEffect } from 'react'
import type { DashboardWithDataset } from '@/lib/types'
import { Navigation } from '@/components/ui/navigation'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { CreateDashboardDialog } from '@/components/dashboard/create-dashboard-dialog'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  LayoutDashboard,
  Search,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'

export default function DashboardListPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [dashboards, setDashboards] = useState<DashboardWithDataset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchDashboards()
    } else if (!authLoading) {
      setIsLoading(false)
    }
  }, [isAuthenticated, authLoading])

  const fetchDashboards = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/dashboards')
      if (!res.ok) throw new Error('Failed to fetch dashboards')
      const data = await res.json()
      setDashboards(data || [])
    } catch (error) {
      console.error('Error fetching dashboards:', error)
      toast.error('Failed to load dashboards')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboards/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete dashboard')
      setDashboards(dashboards.filter((d) => d.id !== id))
      setDeleteId(null)
      toast.success('Dashboard deleted successfully')
    } catch (error) {
      console.error('Error deleting dashboard:', error)
      toast.error('Failed to delete dashboard')
    }
  }

  const filteredDashboards = dashboards.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.dataset.name.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Background Pattern */}
        <div className="fixed inset-0 grid-pattern opacity-50 pointer-events-none" />

        {/* Gradient Orbs */}
        <div className="fixed top-20 right-20 w-[500px] h-[500px] bg-chart-1/10 rounded-full blur-3xl opacity-20 pointer-events-none" />
        <div className="fixed bottom-20 left-20 w-[400px] h-[400px] bg-chart-2/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

        <Navigation />

        <main className="relative pt-24 pb-16 px-6">
          <div className="mx-auto max-w-6xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <LayoutDashboard className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Dashboards
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Multi-panel views of your data
                  </p>
                </div>
              </div>

              <Button onClick={() => setCreateOpen(true)} className="shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                New Dashboard
              </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-md mb-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search dashboards..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-secondary/30 border-border/50 focus:border-primary/50"
              />
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-36 rounded-xl bg-secondary/30 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredDashboards.length === 0 ? (
              <EmptyState
                hasDashboards={dashboards.length > 0}
                onCreate={() => setCreateOpen(true)}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredDashboards.map((dashboard, index) => (
                  <DashboardCard
                    key={dashboard.id}
                    dashboard={dashboard}
                    index={index}
                    onEdit={() => {
                      // TODO: Open edit dialog
                    }}
                    onDelete={setDeleteId}
                    onDuplicate={() => {
                      // TODO: Handle duplicate
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Create Dialog */}
        <CreateDashboardDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={fetchDashboards}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Dashboard?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the dashboard and all its panels.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AuthGuard>
  )
}

function EmptyState({
  hasDashboards,
  onCreate,
}: {
  hasDashboards: boolean
  onCreate: () => void
}) {
  if (hasDashboards) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No dashboards match your search
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
          <LayoutDashboard className="h-10 w-10 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-xl font-semibold mb-2">No dashboards yet</h3>
      <p className="text-muted-foreground text-center max-w-sm mb-6">
        Create a dashboard to combine multiple charts viewing the same dataset
      </p>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4 mr-2" />
        Create Dashboard
      </Button>
    </div>
  )
}

