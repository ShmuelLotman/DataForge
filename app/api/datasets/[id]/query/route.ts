import { NextResponse } from 'next/server'
import { executeDatasetQuery } from '@/lib/db-actions'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}
