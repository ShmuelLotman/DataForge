'use client'

import { useState, useEffect } from 'react'
import type { Dataset } from '@/lib/types'
import { DatasetCard } from './dataset-card'
import { CreateDatasetDialog } from './create-dataset-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Database, Sparkles } from 'lucide-react'
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

export function DatasetList() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    fetchDatasets()
  }, [])

  const fetchDatasets = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/datasets')
      const data = await res.json()
      setDatasets(data)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/datasets/${id}`, { method: 'DELETE' })
    setDatasets(datasets.filter((d) => d.id !== id))
    setDeleteId(null)
  }

  const filteredDatasets = datasets.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            Your Datasets
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and explore your data collections
          </p>
        </div>

        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Dataset
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search datasets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-secondary/30 border-border/50 focus:border-primary/50"
        />
      </div>

      {/* Dataset Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-36 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      ) : filteredDatasets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredDatasets.map((dataset, index) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              onDelete={setDeleteId}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Database className="h-10 w-10 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">No datasets yet</h3>
          <p className="text-muted-foreground text-center max-w-sm mb-6">
            Create your first dataset to start organizing and visualizing your
            CSV data
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Dataset
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <CreateDatasetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchDatasets}
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
