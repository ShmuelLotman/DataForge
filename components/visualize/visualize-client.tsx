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
import { Reveal } from '@/components/ui/reveal'

interface VisualizeClientProps {
  datasetId: string
}

export function VisualizeClient({ datasetId }: VisualizeClientProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  // TanStack Query hooks
  const { data: dataset, isLoading: datasetLoading } = useDatasetQuery(
    datasetId,
    {
      enabled: isAuthenticated && !authLoading,
    }
  )

  const { data: files = [], isLoading: filesLoading } = useDatasetFilesQuery(
    datasetId,
    {
      enabled: isAuthenticated && !authLoading,
    }
  )

  const isLoading = authLoading || datasetLoading || filesLoading

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="pt-32 pb-16 px-6">
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
        <main className="pt-32 pb-16 px-6">
          <div className="mx-auto max-w-7xl text-center">
            <p className="text-xl text-muted-foreground mb-4">
              Dataset not found
            </p>
            <Link href="/visualize">
              <Button>Back to Visualize</Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 grid-pattern opacity-[0.03] pointer-events-none" />
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px] opacity-20 pointer-events-none" />

      <Navigation />

      <main className="relative pt-32 pb-20 px-6 sm:px-8">
        <div className="mx-auto max-w-[1600px]">
          {/* Header */}
          <Reveal width="100%">
            <div className="mb-10">
              <Link href="/visualize">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Datasets
                </Button>
              </Link>

              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="flex items-start gap-5">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-lg shadow-primary/10 mt-1">
                    <Database className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-4">
                      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                        {dataset.name}
                      </h1>
                      <Link href={`/visualize/${dataset.id}/ai`}>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border-0 shadow-lg shadow-indigo-500/20 rounded-full px-4"
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-2" />
                          AI Insights
                        </Button>
                      </Link>
                    </div>
                    {dataset.description && (
                      <p className="text-muted-foreground mt-2 max-w-2xl text-lg">
                        {dataset.description}
                      </p>
                    )}

                    <div className="flex items-center gap-6 mt-4 text-sm font-medium text-muted-foreground">
                      <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1 rounded-full">
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>{files.length} files</span>
                      </div>
                      <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1 rounded-full">
                        <Rows3 className="h-4 w-4" />
                        <span>{dataset.rowCount.toLocaleString()} rows</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schema Preview */}
                {dataset.canonicalSchema && (
                  <div className="flex flex-wrap gap-2 max-w-md lg:justify-end">
                    {dataset.canonicalSchema.slice(0, 8).map((col) => (
                      <Badge
                        key={col.id}
                        variant="secondary"
                        className="bg-card/50 border border-border/50 backdrop-blur-sm"
                      >
                        {col.label || col.id}
                        <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-50">
                          {col.type}
                        </span>
                      </Badge>
                    ))}
                    {dataset.canonicalSchema.length > 8 && (
                      <Badge variant="outline" className="border-dashed">
                        +{dataset.canonicalSchema.length - 8} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Reveal>

          {/* Chart Builder */}
          <Reveal width="100%" delay={0.2}>
            <div className="bg-card/30 border border-white/5 backdrop-blur-sm rounded-3xl p-1 overflow-hidden shadow-2xl">
              <ChartBuilder dataset={dataset} files={files} />
            </div>
          </Reveal>
        </div>
      </main>
    </div>
  )
}
