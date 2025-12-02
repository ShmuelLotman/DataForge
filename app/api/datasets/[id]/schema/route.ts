import { NextResponse } from 'next/server'
import { getDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id } = await params
    const dataset = await getDataset(id, session.user.id)

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    return NextResponse.json({
      columns: dataset.canonicalSchema || [],
    })
  } catch (error) {
    console.error('Schema fetch error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to fetch schema' },
      { status: 500 }
    )
  }
}


