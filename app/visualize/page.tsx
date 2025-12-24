'use client'

import { useState, useEffect } from 'react'
import type { Dataset } from '@/lib/types'
import { Navigation } from '@/components/ui/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, BarChart3, Database, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AuthGuard } from '@/components/auth/auth-guard'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Reveal } from '@/components/ui/reveal'

export default function VisualizePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Only fetch datasets if authenticated (AuthGuard will redirect if not)
    if (!authLoading && isAuthenticated) {
      fetch('/api/datasets')
        .then((res) => {
          if (!res.ok) {
            throw new Error('Failed to fetch datasets')
          }
          return res.json()
        })
        .then((data) => {
          setDatasets(data || [])
          setIsLoading(false)
        })
        .catch(() => {
          toast.error('Failed to load datasets')
          setIsLoading(false)
        })
    }
  }, [isAuthenticated, authLoading])

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background overflow-hidden">
        {/* Background Atmosphere */}
        <div className="fixed inset-0 grid-pattern opacity-[0.03] pointer-events-none" />
        <div className="fixed top-20 right-20 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] opacity-20 pointer-events-none" />
        <div className="fixed bottom-20 left-20 w-[400px] h-[400px] bg-secondary/20 rounded-full blur-[100px] opacity-20 pointer-events-none" />

        <Navigation />

        <main className="relative pt-32 pb-20 px-6 sm:px-8">
          <div className="mx-auto max-w-6xl">
            {/* Header */}
            <Reveal width="100%">
                <div className="mb-12">
                <div className="flex items-center gap-5">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-lg shadow-primary/10">
                    <BarChart3 className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                    <h1 className="text-4xl font-bold tracking-tight text-foreground">
                        Visualize
                    </h1>
                    <p className="text-lg text-muted-foreground mt-2">
                        Select a dataset to begin exploring and charting your data
                    </p>
                    </div>
                </div>
                </div>
            </Reveal>

            {/* Dataset Selection */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : datasets.length === 0 ? (
              <Reveal>
                  <div className="flex flex-col items-center justify-center py-24 px-4 border border-dashed border-border/50 rounded-3xl bg-card/20">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-6">
                    <Database className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">
                    No datasets available
                    </h3>
                    <p className="text-muted-foreground text-center max-w-sm mb-8">
                    Create a dataset and upload some CSV files to start
                    visualizing
                    </p>
                    <Link href="/upload">
                    <Button size="lg" className="rounded-full px-8">
                        Go to Upload
                        <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    </Link>
                </div>
              </Reveal>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {datasets.map((dataset, index) => (
                  <Reveal key={dataset.id} delay={index * 0.1}>
                    <Link href={`/visualize/${dataset.id}`}>
                        <Card
                        className={cn(
                            'group cursor-pointer overflow-hidden border-border/40 bg-card/40 backdrop-blur-md',
                            'hover:border-primary/40 hover:bg-card/60 transition-all duration-500',
                            'hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1'
                        )}
                        >
                        {/* Glow Effect */}
                        <div className="absolute -inset-[100px] bg-primary/20 opacity-0 group-hover:opacity-20 blur-[60px] transition-opacity duration-500 pointer-events-none" />

                        <CardContent className="relative p-6">
                            <div className="flex items-center gap-5">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/10 group-hover:scale-110 transition-transform duration-300">
                                <BarChart3 className="h-7 w-7" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-heading font-bold text-lg mb-1 truncate group-hover:text-primary transition-colors">
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
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
