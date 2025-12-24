import { NextResponse } from 'next/server'
import { getDatasets, createDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

export async function GET() {
  try {
    const session = await requireAuth()
    const datasets = await getDatasets(session.user.id)
    return NextResponse.json(datasets)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to fetch datasets' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const dataset = await createDataset(
      {
        name,
        description: description || '',
        canonicalSchema: null,
      },
      session.user.id
    )

    return NextResponse.json(dataset)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to create dataset' },
      { status: 500 }
    )
  }
}
