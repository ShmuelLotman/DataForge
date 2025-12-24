import { NextResponse } from 'next/server'
import { getDashboards, createDashboard, getDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

// GET /api/dashboards - Get all dashboards for current user
export async function GET() {
  try {
    const session = await requireAuth()
    const dashboards = await getDashboards(session.user.id)
    return NextResponse.json(dashboards)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to fetch dashboards' },
      { status: 500 }
    )
  }
}

// POST /api/dashboards - Create a new dashboard
export async function POST(request: Request) {
  try {
    const session = await requireAuth()
    const body = await request.json()
    const { datasetId, name, description } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      )
    }

    // If datasetId provided, verify dataset ownership
    if (datasetId) {
      const dataset = await getDataset(datasetId, session.user.id)
      if (!dataset) {
        return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
      }
    }

    const dashboard = await createDashboard(
      { datasetId: datasetId || null, name, description },
      session.user.id
    )

    return NextResponse.json(dashboard, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to create dashboard' },
      { status: 500 }
    )
  }
}

