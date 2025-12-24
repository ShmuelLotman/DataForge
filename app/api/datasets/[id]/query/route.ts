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

    // Auto-detect KPI mode from legacy x-axis values
    const isKpiMode = body.aggregateOnly === true || 
      body.x?.column === '_kpi' || 
      body.x?.column === '_unused'
    
    // Ensure aggregateOnly is set for KPI queries
    const queryBody = isKpiMode 
      ? { ...body, aggregateOnly: true }
      : body

    const data = await executeDatasetQuery(id, queryBody)

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}
