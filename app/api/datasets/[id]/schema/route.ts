import { NextResponse } from 'next/server'
import { getDataset } from '@/lib/db-actions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const dataset = await getDataset(id)

    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    return NextResponse.json({
      columns: dataset.canonicalSchema || [],
    })
  } catch (error) {
    console.error('Schema fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch schema' },
      { status: 500 }
    )
  }
}


