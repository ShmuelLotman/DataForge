'use client'

import { useState, useEffect } from 'react'
import type { Dataset } from '@/lib/types'
import { Navigation } from '@/components/ui/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, BarChart3, Database, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function VisualizePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/datasets')
      .then((res) => res.json())
      .then((data) => {
        setDatasets(data)
        setIsLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Background Pattern */}
      <div className="fixed inset-0 grid-pattern opacity-50 pointer-events-none" />

      {/* Gradient Orbs */}
      <div className="fixed top-20 right-20 w-[500px] h-[500px] bg-chart-1/10 rounded-full blur-3xl opacity-20 pointer-events-none" />
      <div className="fixed bottom-20 left-20 w-[400px] h-[400px] bg-chart-2/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

      <Navigation />

      <main className="relative pt-24 pb-16 px-6">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Visualize</h1>
                <p className="text-muted-foreground mt-1">
                  Select a dataset to create charts and explore your data
                </p>
              </div>
            </div>
          </div>

          {/* Dataset Selection */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-6">
                <Database className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                No datasets available
              </h3>
              <p className="text-muted-foreground text-center max-w-sm mb-6">
                Create a dataset and upload some CSV files to start visualizing
              </p>
              <Link href="/upload">
                <Button>
                  Go to Upload
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {datasets.map((dataset, index) => (
                <Link key={dataset.id} href={`/visualize/${dataset.id}`}>
                  <Card
                    className={cn(
                      'group cursor-pointer overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm',
                      'hover:border-primary/30 hover:bg-card/80 transition-all duration-300',
                      'animate-in fade-in slide-in-from-bottom-4'
                    )}
                    style={{
                      animationDelay: `${index * 100}ms`,
                      animationFillMode: 'backwards',
                    }}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 group-hover:scale-110 transition-transform">
                          <BarChart3 className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">
                            {dataset.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {dataset.fileCount} files •{' '}
                            {dataset.rowCount.toLocaleString()} rows
                          </p>
                        </div>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
