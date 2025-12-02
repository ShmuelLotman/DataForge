'use client'

import { VisualizeClient } from '@/components/visualize/visualize-client'
import { AuthGuard } from '@/components/auth/auth-guard'
import { BarChart3 } from 'lucide-react'
import { use } from 'react'

interface VisualizeDatasPageProps {
  params: Promise<{ id: string }>
}

export default function VisualizeDatasPage({
  params,
}: VisualizeDatasPageProps) {
  const { id } = use(params)

  return (
    <AuthGuard>
      <VisualizeClient datasetId={id} />
    </AuthGuard>
  )
}
