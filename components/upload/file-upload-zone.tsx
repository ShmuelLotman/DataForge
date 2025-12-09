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
  FileText,
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
    
    if (csvFiles.length < Array.from(fileList).length) {
        toast.error('Only CSV files are supported')
    }

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
    toast.success('Upload complete')
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
          'group relative border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-500 ease-out cursor-pointer overflow-hidden',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01] shadow-2xl shadow-primary/10'
            : 'border-border/40 hover:border-primary/30 hover:bg-muted/30'
        )}
      >
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
        />

        {/* Ambient Glow */}
        <div className={cn(
            "absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 pointer-events-none",
            isDragging || "group-hover:opacity-100"
        )} />

        <div className="relative z-10 flex flex-col items-center gap-6">
          <div
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-500 shadow-xl',
              isDragging ? 'bg-primary text-primary-foreground scale-110 rotate-3' : 'bg-background border border-border/50 text-muted-foreground group-hover:text-primary group-hover:border-primary/30 group-hover:scale-105'
            )}
          >
            <Upload
              className="h-8 w-8"
            />
          </div>

          <div>
            <p className="text-xl font-bold text-foreground">
              Drop your CSV files here
            </p>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
              Drag and drop your files or click to browse. We support bulk uploads for efficiency.
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-foreground">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
            </h3>
            {hasFilesToUpload && (
              <Button
                onClick={uploadFiles}
                disabled={isUploading || !datasetId}
                className="rounded-full px-6 shadow-lg shadow-primary/20"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload All
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="grid gap-3">
            {files.map((file, index) => (
              <div
                key={file.id}
                className={cn(
                  'relative overflow-hidden flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300',
                  'animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards',
                  file.status === 'success' && 'bg-primary/5 border-primary/20',
                  file.status === 'error' &&
                    'bg-destructive/5 border-destructive/20',
                  file.status === 'pending' &&
                    'bg-card/40 border-border/40 backdrop-blur-sm',
                  file.status === 'uploading' &&
                    'bg-card/60 border-primary/30'
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                 {file.status === 'uploading' && (
                    <div className="absolute inset-0 bg-primary/5">
                        <div 
                            className="h-full bg-primary/10 transition-all duration-300 ease-out" 
                            style={{ width: `${file.progress}%` }} 
                        />
                    </div>
                 )}

                <div
                  className={cn(
                    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                    file.status === 'success' && 'bg-primary/20 text-primary',
                    file.status === 'error' && 'bg-destructive/20 text-destructive',
                    (file.status === 'pending' || file.status === 'uploading') &&
                      'bg-secondary text-muted-foreground'
                  )}
                >
                  {file.status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : file.status === 'error' ? (
                    <AlertCircle className="h-5 w-5" />
                  ) : file.status === 'uploading' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5" />
                  )}
                </div>

                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate text-foreground">
                        {file.file.name}
                    </p>
                    {file.status === 'success' && <span className="text-[10px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-1.5 py-0.5 rounded">Complete</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(file.file.size / 1024).toFixed(1)} KB
                    {file.error && (
                      <span className="text-destructive ml-2 font-medium">
                        • {file.error}
                      </span>
                    )}
                  </p>
                </div>

                {file.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-colors rounded-full"
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
