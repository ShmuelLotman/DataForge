'use client'

import { useState, useEffect } from 'react'
import type { Dataset } from '@/lib/types'
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
import { Plus, Database, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DatasetSelectorProps {
  value: string | null
  onChange: (id: string | null) => void
  initialDatasetId?: string
}

export function DatasetSelector({
  value,
  onChange,
  initialDatasetId,
}: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchDatasets()
  }, [])

  useEffect(() => {
    if (initialDatasetId && datasets.length > 0) {
      onChange(initialDatasetId)
    }
  }, [initialDatasetId, datasets, onChange])

  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/datasets')
      const data = await res.json()
      setDatasets(data)
    } finally {
      setIsLoading(false)
    }
  }

  const createDataset = async () => {
    if (!newName.trim()) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      const dataset = await res.json()
      setDatasets([...datasets, dataset])
      onChange(dataset.id)
      setNewName('')
      setIsCreating(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedDataset = datasets.find((d) => d.id === value)

  return (
    <div className="space-y-4">
      <Label className="text-base font-medium">Select Dataset</Label>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading datasets...
        </div>
      ) : isCreating ? (
        <div className="space-y-3">
          <Input
            placeholder="Dataset name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-secondary/30"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              onClick={createDataset}
              disabled={!newName.trim() || isSubmitting}
              size="sm"
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreating(false)
                setNewName('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Select value={value || ''} onValueChange={onChange}>
            <SelectTrigger className="bg-secondary/30 border-border/50">
              <SelectValue placeholder="Choose a dataset..." />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span>{dataset.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({dataset.fileCount} files)
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreating(true)}
            className="w-full border-dashed"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New Dataset
          </Button>
        </div>
      )}

      {/* Selected Dataset Info */}
      {selectedDataset && (
        <div
          className={cn(
            'p-4 rounded-xl border border-primary/20 bg-primary/5',
            'animate-in fade-in slide-in-from-bottom-2'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {selectedDataset.name}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedDataset.fileCount} files •{' '}
                {selectedDataset.rowCount.toLocaleString()} rows
              </p>
              {selectedDataset.canonicalSchema && (
                <p className="text-xs text-muted-foreground mt-1">
                  Schema:{' '}
                  {selectedDataset.canonicalSchema
                    .map((c) => c.label)
                    .join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
