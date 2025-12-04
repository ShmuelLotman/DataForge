import { NextResponse } from 'next/server'
import { reorderPanels } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

// POST /api/dashboards/:id/panels/reorder
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth()
    const { id: dashboardId } = await params
    const { panelIds } = await request.json()

    if (!Array.isArray(panelIds)) {
      return NextResponse.json(
        { error: 'panelIds must be an array' },
        { status: 400 }
      )
    }

    await reorderPanels(dashboardId, panelIds, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error reordering panels:', error)
    return NextResponse.json(
      { error: 'Failed to reorder panels' },
      { status: 500 }
    )
  }
}

