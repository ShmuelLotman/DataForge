import { NextResponse } from 'next/server'
import { addPanel } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

// POST /api/dashboards/:id/panels - Add a panel to dashboard
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id: dashboardId } = await params
    const body = await request.json()
    const { datasetId, datasetIds, title, config } = body

    if (!datasetId || !title || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: datasetId, title, config' },
        { status: 400 }
      )
    }

    if (datasetIds && !datasetIds.includes(datasetId)) {
      return NextResponse.json(
        { error: 'datasetIds must include the primary datasetId' },
        { status: 400 }
      )
    }

    const panel = await addPanel(
      dashboardId,
      { datasetId, title, config: { ...config, datasetIds: datasetIds || config.datasetIds } },
      session.user.id
    )

    return NextResponse.json(panel, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Dashboard not found') {
      return NextResponse.json(
        { error: 'Dashboard not found' },
        { status: 404 }
      )
    }
    if (error instanceof Error && error.message === 'Dataset not found') {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }
    console.error('Error adding panel:', error)
    return NextResponse.json({ error: 'Failed to add panel' }, { status: 500 })
  }
}
