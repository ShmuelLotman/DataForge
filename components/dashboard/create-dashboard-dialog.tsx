'use client'

import { useState, useEffect } from 'react'
import type { Dataset } from '@/lib/types'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Database } from 'lucide-react'
import { toast } from 'sonner'

interface CreateDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  preselectedDatasetId?: string
}

export function CreateDashboardDialog({
  open,
  onOpenChange,
  onCreated,
  preselectedDatasetId,
}: CreateDashboardDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [datasetId, setDatasetId] = useState(preselectedDatasetId || '')
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Fetch datasets when dialog opens
  useEffect(() => {
    if (open && !preselectedDatasetId) {
      setIsLoading(true)
      fetch('/api/datasets')
        .then((res) => res.json())
        .then((data) => {
          setDatasets(data || [])
        })
        .catch(() => {
          toast.error('Failed to load datasets')
        })
        .finally(() => setIsLoading(false))
    }
  }, [open, preselectedDatasetId])

  // Set preselected dataset
  useEffect(() => {
    if (preselectedDatasetId) {
      setDatasetId(preselectedDatasetId)
    }
  }, [preselectedDatasetId])

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a dashboard name')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          datasetId: datasetId || null,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create dashboard')
      }

      toast.success('Dashboard created successfully')
      resetForm()
      onOpenChange(false)
      onCreated?.()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create dashboard'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    if (!preselectedDatasetId) {
      setDatasetId('')
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Dashboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Dashboard Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Q4 Sales Overview"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this dashboard..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Dataset Selection */}
          {!preselectedDatasetId && (
            <div className="space-y-2">
              <Label>Dataset</Label>
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading datasets...
                </div>
              ) : datasets.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-md bg-muted/50">
                  <Database className="h-4 w-4" />
                  No datasets available. Upload data first.
                </div>
              ) : (
                <Select value={datasetId} onValueChange={setDatasetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span>{dataset.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({dataset.rowCount.toLocaleString()} rows)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


