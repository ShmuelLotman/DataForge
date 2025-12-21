import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getDataset } from '@/lib/db-actions'
import { generateDatasetEmbeddings } from '@/lib/ai/embeddings'

/**
 * POST /api/datasets/[id]/embeddings
 * Regenerate AI embeddings for a dataset
 * 
 * This is useful for:
 * - Refreshing embeddings after schema changes
 * - Regenerating embeddings with improved embedding logic
 * - Debugging RAG retrieval issues
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id: datasetId } = await params

    // Verify dataset access
    const dataset = await getDataset(datasetId, session.user.id)
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Generate embeddings
    console.log(`[Embeddings API] Regenerating embeddings for dataset ${datasetId}`)
    await generateDatasetEmbeddings(datasetId, dataset)

    return NextResponse.json({
      success: true,
      message: 'Embeddings regenerated successfully',
      datasetId,
      datasetName: dataset.name,
    })
  } catch (error) {
    console.error('[Embeddings API] Error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to regenerate embeddings' },
      { status: 500 }
    )
  }
}


