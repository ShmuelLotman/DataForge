import { VisualizeClient } from '@/components/visualize/visualize-client'

interface VisualizeDatasPageProps {
  params: Promise<{ id: string }>
}

export default async function VisualizeDatasPage({
  params,
}: VisualizeDatasPageProps) {
  const { id } = await params

  return <VisualizeClient datasetId={id} />
}
