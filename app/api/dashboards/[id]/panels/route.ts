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
    const { title, config } = body

    if (!title || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: title, config' },
        { status: 400 }
      )
    }

    const panel = await addPanel(
      dashboardId,
      { title, config },
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
    console.error('Error adding panel:', error)
    return NextResponse.json({ error: 'Failed to add panel' }, { status: 500 })
  }
}

