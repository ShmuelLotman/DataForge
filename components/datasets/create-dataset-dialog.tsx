'use client'

import type React from 'react'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateDatasetMutation } from '@dataforge/query-hooks'
import type { AxiosError } from 'axios'

interface CreateDatasetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateDatasetDialog({
  open,
  onOpenChange,
}: CreateDatasetDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const createDatasetMutation = useCreateDatasetMutation({
    onSuccess: () => {
      setName('')
      setDescription('')
      onOpenChange(false)
      toast.success('Dataset created successfully')
    },
    onError: (error: AxiosError<{ error?: string }>) => {
      if (error.response?.status === 401) {
        toast.error('Please sign in to create datasets')
        onOpenChange(false)
        return
      }
      console.error('Error creating dataset:', error)
      toast.error(error.response?.data?.error || 'Failed to create dataset')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    createDatasetMutation.mutate({ name, description })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Dataset</DialogTitle>
            <DialogDescription>
              A dataset groups related CSV files with the same structure
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Monthly Sales Report"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-secondary/30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What does this dataset contain?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-secondary/30 resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createDatasetMutation.isPending}>
              {createDatasetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Dataset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
