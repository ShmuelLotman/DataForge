import { NextResponse } from 'next/server'
import { getDatasets, createDataset } from '@/lib/db-actions'

export async function GET() {
  try {
    const datasets = await getDatasets()
    return NextResponse.json(datasets)
  } catch (error) {
    console.error('Error fetching datasets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch datasets' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const dataset = await createDataset({
      name,
      description: description || '',
      canonicalSchema: null,
    })

    return NextResponse.json(dataset)
  } catch (error) {
    console.error('Error creating dataset:', error)
    return NextResponse.json(
      { error: 'Failed to create dataset' },
      { status: 500 }
    )
  }
}
