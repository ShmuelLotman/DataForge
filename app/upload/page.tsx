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
import { Reveal } from '@/components/ui/reveal'

function UploadContent() {
  const searchParams = useSearchParams()
  const initialDatasetId = searchParams.get('dataset') || undefined
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <Reveal width="100%">
        <div className="mb-10">
            <Link href="/">
            <Button variant="ghost" size="sm" className="mb-6 -ml-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Datasets
            </Button>
            </Link>

            <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-lg shadow-primary/10">
                <Upload className="h-8 w-8 text-primary" />
            </div>
            <div>
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Upload Files</h1>
                <p className="text-lg text-muted-foreground mt-2">
                Add CSV files to your datasets for instant analysis
                </p>
            </div>
            </div>
        </div>
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Dataset Selector */}
        <div className="lg:col-span-1">
          <Reveal width="100%" delay={0.1}>
            <div className="sticky top-24 p-6 rounded-3xl border border-white/5 bg-card/30 backdrop-blur-md shadow-xl">
                <h3 className="font-semibold mb-4 text-foreground">Target Dataset</h3>
                <DatasetSelector
                value={selectedDataset}
                onChange={setSelectedDataset}
                initialDatasetId={initialDatasetId}
                />
                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                    Select the dataset where these files will be added. You can also create a new dataset directly from here.
                </p>
            </div>
          </Reveal>
        </div>

        {/* Upload Zone */}
        <div className="lg:col-span-2">
          <Reveal width="100%" delay={0.2}>
            <FileUploadZone
                datasetId={selectedDataset}
                onUploadComplete={() => {
                // Could show a toast or update state
                }}
            />

            {!selectedDataset && (
                <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center text-sm font-medium animate-pulse">
                   Please select or create a dataset to enable uploading.
                </div>
            )}
          </Reveal>
        </div>
      </div>
    </div>
  )
}

export default function UploadPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background overflow-hidden">
        {/* Background Atmosphere */}
        <div className="fixed inset-0 grid-pattern opacity-[0.03] pointer-events-none" />
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] opacity-30 pointer-events-none" />
        <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[100px] opacity-20 pointer-events-none" />

        <Navigation />

        <main className="relative pt-32 pb-20 px-6">
          <Suspense
            fallback={
              <div className="mx-auto max-w-5xl animate-pulse h-96 bg-muted/10 rounded-3xl" />
            }
          >
            <UploadContent />
          </Suspense>
        </main>
      </div>
    </AuthGuard>
  )
}
