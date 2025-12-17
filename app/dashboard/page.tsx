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
import { LayoutDashboard, Search, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Reveal } from '@/components/ui/reveal'

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
      <div className="min-h-screen bg-background overflow-hidden">
        {/* Background Atmosphere */}
        <div className="fixed inset-0 grid-pattern opacity-[0.03] pointer-events-none" />
        <div className="fixed top-20 left-20 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />
        <div className="fixed bottom-20 right-20 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-[120px] opacity-20 pointer-events-none" />

        <Navigation />

        <main className="relative pt-32 pb-20 px-6 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="space-y-8">
              {/* Header Actions */}
              <Reveal width="100%">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card/30 p-2 rounded-2xl border border-white/5 backdrop-blur-sm mb-8">
                  <div className="relative w-full sm:w-96 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      placeholder="Search dashboards..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 h-10 bg-background/50 border-transparent focus:bg-background transition-all rounded-xl"
                    />
                  </div>

                  <Button
                    onClick={() => setCreateOpen(true)}
                    className="w-full sm:w-auto rounded-xl h-10 px-6 shadow-lg shadow-primary/20"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Dashboard
                  </Button>
                </div>
              </Reveal>

              {/* Content */}
              {isLoading ? (
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-48 rounded-2xl bg-muted/20 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredDashboards.length === 0 ? (
                <Reveal>
                  <EmptyState
                    hasDashboards={dashboards.length > 0}
                    onCreate={() => setCreateOpen(true)}
                  />
                </Reveal>
              ) : (
                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                  {filteredDashboards.map((dashboard, index) => (
                    <Reveal key={dashboard.id} delay={index * 0.1}>
                      <DashboardCard
                        dashboard={dashboard}
                        index={index}
                        onEdit={() => {
                          // TODO: Open edit dialog
                          // Since the dialog logic wasn't fully implemented in the original file (just comment),
                          // we'll leave it as is, or you might want to implement it.
                          // For now, I'll assume it's handled elsewhere or upcoming.
                        }}
                        onDelete={setDeleteId}
                        onDuplicate={() => {
                          // TODO: Handle duplicate
                        }}
                      />
                    </Reveal>
                  ))}
                </div>
              )}
            </div>
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
      <div className="text-center py-12 border border-dashed border-border/50 rounded-3xl bg-card/20">
        <p className="text-muted-foreground">
          No dashboards match your search.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 border border-dashed border-border/50 rounded-3xl bg-card/20">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <LayoutDashboard className="h-10 w-10" />
        </div>
        <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-background border border-border shadow-sm">
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-xl font-bold mb-2">No dashboards yet</h3>
      <p className="text-muted-foreground text-center max-w-sm mb-8">
        Create a dashboard to combine multiple charts viewing the same dataset
      </p>
      <Button onClick={onCreate} size="lg" className="rounded-full px-8">
        <Plus className="h-4 w-4 mr-2" />
        Create Dashboard
      </Button>
    </div>
  )
}
