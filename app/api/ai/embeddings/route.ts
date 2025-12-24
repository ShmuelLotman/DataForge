import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getDataset } from '@/lib/db-actions'
import { generateDatasetEmbeddings } from '@/lib/ai/embeddings'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { datasetId } = await req.json()

    // Verify dataset access
    const dataset = await getDataset(datasetId, session.user.id)
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Get sample data (first 100 rows)
    const { data: sampleRows, error: sampleError } = await supabase
      .from('data_rows')
      .select('data')
      .eq('dataset_id', datasetId)
      .limit(100)

    if (sampleError) {
      return NextResponse.json(
        { error: 'Failed to fetch sample data' },
        { status: 500 }
      )
    }

    const sampleData =
      sampleRows?.map((row) => row.data as Record<string, unknown>) || []

    // Generate and store embeddings
    await generateDatasetEmbeddings(datasetId, dataset, sampleData)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to generate embeddings' },
      { status: 500 }
    )
  }
}

