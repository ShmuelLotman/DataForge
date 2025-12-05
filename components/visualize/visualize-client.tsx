'use client'

import { Navigation } from '@/components/ui/navigation'
import { ChartBuilder } from '@/components/visualize/chart-builder'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Database,
  FileSpreadsheet,
  Rows3,
  Loader2,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { useDatasetQuery, useDatasetFilesQuery } from '@dataforge/query-hooks'

interface VisualizeClientProps {
  datasetId: string
}

export function VisualizeClient({ datasetId }: VisualizeClientProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  // TanStack Query hooks
  const {
    data: dataset,
    isLoading: datasetLoading,
  } = useDatasetQuery(datasetId, {
    enabled: isAuthenticated && !authLoading,
  })

  const {
    data: files = [],
    isLoading: filesLoading,
  } = useDatasetFilesQuery(datasetId, {
    enabled: isAuthenticated && !authLoading,
  })

  const isLoading = authLoading || datasetLoading || filesLoading

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="pt-24 pb-16 px-6">
          <div className="mx-auto max-w-7xl flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="pt-24 pb-16 px-6">
          <div className="mx-auto max-w-7xl">
            <p className="text-muted-foreground">Dataset not found</p>
            <Link href="/visualize">
              <Button className="mt-4">Back to Visualize</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Background Pattern */}
      <div className="fixed inset-0 grid-pattern opacity-50 pointer-events-none" />

      {/* Gradient Orbs */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

      <Navigation />

      <main className="relative pt-24 pb-16 px-6">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <Link href="/visualize">
              <Button variant="ghost" size="sm" className="mb-4 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Datasets
              </Button>
            </Link>

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                  <Database className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold tracking-tight">
                      {dataset.name}
                    </h1>
                    <Link href={`/visualize/${dataset.id}/ai`}>
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        AI Mode
                      </Button>
                    </Link>
                  </div>
                  {dataset.description && (
                    <p className="text-muted-foreground mt-1">
                      {dataset.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{files.length} files</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Rows3 className="h-4 w-4" />
                  <span>{dataset.rowCount.toLocaleString()} rows</span>
                </div>
              </div>
            </div>

            {/* Schema Preview */}
            {dataset.canonicalSchema && (
              <div className="mt-4 flex flex-wrap gap-2">
                {dataset.canonicalSchema.map((col) => (
                  <Badge
                    key={col.id}
                    variant="secondary"
                    className="bg-secondary/50"
                  >
                    {col.label || col.id}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {col.type}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Chart Builder */}
          <ChartBuilder dataset={dataset} files={files} />
        </div>
      </main>
    </div>
  )
}
