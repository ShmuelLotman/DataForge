'use client'

import { useState, useMemo } from 'react'
import { DatasetCard } from './dataset-card'
import { CreateDatasetDialog } from './create-dataset-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Database, Sparkles } from 'lucide-react'
import { Reveal } from '@/components/ui/reveal'
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
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useDatasetsQuery, useDeleteDatasetMutation } from '@dataforge/query-hooks'

export function DatasetList() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // TanStack Query hooks
  const {
    data: datasets = [],
    isLoading: datasetsLoading,
    error: datasetsError,
  } = useDatasetsQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  })

  const deleteDatasetMutation = useDeleteDatasetMutation({
    onSuccess: () => {
      setDeleteId(null)
      toast.success('Dataset deleted successfully')
    },
    onError: () => {
      toast.error('Failed to delete dataset')
    },
  })

  const isLoading = authLoading || datasetsLoading

  // Show error toast when datasets fail to load
  if (datasetsError && !datasetsLoading) {
    console.error('Error fetching datasets:', datasetsError)
  }

  const handleDelete = (id: string) => {
    deleteDatasetMutation.mutate(id)
  }

  const handleCreateClick = () => {
    setCreateOpen(true)
  }

  const filteredDatasets = useMemo(
    () =>
      datasets.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.description?.toLowerCase().includes(search.toLowerCase())
      ),
    [datasets, search]
  )

  return (
    <div className="space-y-8">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card/30 p-2 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="relative w-full sm:w-96 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search collections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 bg-background/50 border-transparent focus:bg-background transition-all rounded-xl"
          />
        </div>

        <Button
          onClick={handleCreateClick}
          className="w-full sm:w-auto rounded-xl h-10 px-6 shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Dataset
        </Button>
      </div>

      {/* Dataset Grid */}
      {isLoading ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-muted/20 animate-pulse"
            />
          ))}
        </div>
      ) : filteredDatasets.length > 0 ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {filteredDatasets.map((dataset, index) => (
            <Reveal key={dataset.id} delay={index * 0.1}>
              <DatasetCard
                dataset={dataset}
                onDelete={setDeleteId}
                index={index}
              />
            </Reveal>
          ))}
        </div>
      ) : (
        <Reveal>
          <div className="flex flex-col items-center justify-center py-24 px-4 border border-dashed border-border/50 rounded-3xl bg-card/20">
            <div className="relative mb-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Database className="h-10 w-10" />
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-background border border-border shadow-sm">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2">No datasets found</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-8">
              {search 
                ? "No datasets match your search criteria. Try a different query." 
                : "Create your first dataset to start organizing and visualizing your data."}
            </p>
            <Button onClick={handleCreateClick} size="lg" className="rounded-full px-8">
              <Plus className="h-4 w-4 mr-2" />
              Create Dataset
            </Button>
          </div>
        </Reveal>
      )}

      {/* Create Dialog */}
      <CreateDatasetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the dataset and all associated files
              and data. This action cannot be undone.
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
  )
}
