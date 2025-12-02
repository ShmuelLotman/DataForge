'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Navigation } from '@/components/ui/navigation'
import { FileUploadZone } from '@/components/upload/file-upload-zone'
import { DatasetSelector } from '@/components/upload/dataset-selector'
import { ArrowLeft, Upload } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AuthGuard } from '@/components/auth/auth-guard'

function UploadContent() {
  const searchParams = useSearchParams()
  const initialDatasetId = searchParams.get('dataset') || undefined
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Datasets
          </Button>
        </Link>

        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Upload className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Upload Files</h1>
            <p className="text-muted-foreground mt-1">
              Add CSV files to your datasets
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Dataset Selector */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
            <DatasetSelector
              value={selectedDataset}
              onChange={setSelectedDataset}
              initialDatasetId={initialDatasetId}
            />
          </div>
        </div>

        {/* Upload Zone */}
        <div className="lg:col-span-2">
          <FileUploadZone
            datasetId={selectedDataset}
            onUploadComplete={() => {
              // Could show a toast or update state
            }}
          />

          {!selectedDataset && (
            <p className="mt-4 text-sm text-muted-foreground text-center">
              Select or create a dataset before uploading files
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UploadPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Background Pattern */}
        <div className="fixed inset-0 grid-pattern opacity-50 pointer-events-none" />

        {/* Gradient Orbs */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

        <Navigation />

        <main className="relative pt-24 pb-16 px-6">
          <Suspense
            fallback={
              <div className="mx-auto max-w-4xl animate-pulse h-96 bg-secondary/30 rounded-2xl" />
            }
          >
            <UploadContent />
          </Suspense>
        </main>
      </div>
    </AuthGuard>
  )
}
