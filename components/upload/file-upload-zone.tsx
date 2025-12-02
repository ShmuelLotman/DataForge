'use client'

import type React from 'react'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

interface FileUploadZoneProps {
  datasetId: string | null
  onUploadComplete?: () => void
}

export function FileUploadZone({
  datasetId,
  onUploadComplete,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true)
    } else if (e.type === 'dragleave') {
      setIsDragging(false)
    }
  }, [])

  const processFiles = useCallback((fileList: FileList) => {
    const csvFiles = Array.from(fileList).filter(
      (f) => f.type === 'text/csv' || f.name.endsWith('.csv')
    )

    const newFiles: UploadedFile[] = csvFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (e.dataTransfer.files?.length) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        processFiles(e.target.files)
      }
    },
    [processFiles]
  )

  const removeFile = (id: string) => {
    setFiles(files.filter((f) => f.id !== id))
  }

  const uploadFiles = async () => {
    if (!datasetId || files.length === 0) return

    setIsUploading(true)

    for (const uploadFile of files) {
      if (uploadFile.status !== 'pending') continue

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: 'uploading', progress: 0 }
            : f
        )
      )

      try {
        // Upload to API
        const formData = new FormData()
        formData.append('datasetId', datasetId)
        formData.append('file', uploadFile.file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (response.status === 401) {
          throw new Error('Please sign in to upload files')
        }

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Upload failed')
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: 'success', progress: 100 }
              : f
          )
        )
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? {
                  ...f,
                  status: 'error',
                  error:
                    error instanceof Error ? error.message : 'Upload failed',
                }
              : f
          )
        )
      }
    }

    setIsUploading(false)
    onUploadComplete?.()
  }

  const pendingFiles = files.filter((f) => f.status === 'pending')
  const hasFilesToUpload = pendingFiles.length > 0 && datasetId

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-border/50 hover:border-primary/50 hover:bg-secondary/20'
        )}
      >
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300',
              isDragging ? 'bg-primary/20 scale-110' : 'bg-secondary/50'
            )}
          >
            <Upload
              className={cn(
                'h-8 w-8 transition-colors',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div>
            <p className="text-lg font-medium text-foreground">
              Drop your CSV files here
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse • Supports batch upload
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </h3>
            {hasFilesToUpload && (
              <Button
                onClick={uploadFiles}
                disabled={isUploading || !datasetId}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {pendingFiles.length} file
                    {pendingFiles.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border transition-all',
                  'animate-in fade-in slide-in-from-bottom-2',
                  file.status === 'success' && 'bg-primary/5 border-primary/20',
                  file.status === 'error' &&
                    'bg-destructive/5 border-destructive/20',
                  file.status === 'pending' &&
                    'bg-secondary/30 border-border/50',
                  file.status === 'uploading' &&
                    'bg-secondary/30 border-primary/30'
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    file.status === 'success' && 'bg-primary/20',
                    file.status === 'error' && 'bg-destructive/20',
                    (file.status === 'pending' ||
                      file.status === 'uploading') &&
                      'bg-secondary/50'
                  )}
                >
                  {file.status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : file.status === 'error' ? (
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  ) : file.status === 'uploading' ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {file.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.file.size / 1024).toFixed(1)} KB
                    {file.error && (
                      <span className="text-destructive ml-2">
                        • {file.error}
                      </span>
                    )}
                  </p>
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="h-1 mt-2" />
                  )}
                </div>

                {file.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
