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
