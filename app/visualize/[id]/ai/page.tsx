import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'
import { AIVisualizeClient } from '@/components/ai-chart/ai-visualize-client'

interface AIVisualizePageProps {
  params: Promise<{ id: string }>
}

export default async function AIVisualizePage({
  params,
}: AIVisualizePageProps) {
  const { id } = await params
  const session = await requireAuth()
  const dataset = await getDataset(id, session.user.id)

  if (!dataset) {
    notFound()
  }

  return (
    <Suspense fallback={<AIVisualizeLoading />}>
      <AIVisualizeClient dataset={dataset} />
    </Suspense>
  )
}

function AIVisualizeLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-muted-foreground">Loading AI Visualizer...</p>
      </div>
    </div>
  )
}

