import { NextResponse } from 'next/server'
import { executeDatasetQuery, getDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id } = await params
    
    // Verify dataset ownership
    const dataset = await getDataset(id, session.user.id)
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    const body = await request.json()

    // Basic validation
    if (!body.x || !body.y) {
      return NextResponse.json(
        { error: 'Missing required parameters: x and y configuration' },
        { status: 400 }
      )
    }

    const data = await executeDatasetQuery(id, body)

    // Debug logging for groupBy issues
    if (body.groupBy && body.groupBy.length > 0) {
      console.log('[Single Query] GroupBy config:', {
        groupBy: body.groupBy,
        rowCount: data.length,
        sampleRow: data[0],
        groupByColumnInSample: body.groupBy[0]?.column
          ? data[0]?.[body.groupBy[0].column]
          : 'N/A',
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Query error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}
