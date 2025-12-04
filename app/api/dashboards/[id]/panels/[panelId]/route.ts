import { NextResponse } from 'next/server'
import { updatePanel, deletePanel } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

// PATCH /api/dashboards/:id/panels/:panelId
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; panelId: string }> }
) {
  try {
    const session = await requireAuth()
    const { panelId } = await params
    const body = await request.json()

    const panel = await updatePanel(panelId, body, session.user.id)
    return NextResponse.json(panel)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Panel not found') {
      return NextResponse.json({ error: 'Panel not found' }, { status: 404 })
    }
    console.error('Error updating panel:', error)
    return NextResponse.json(
      { error: 'Failed to update panel' },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboards/:id/panels/:panelId
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; panelId: string }> }
) {
  try {
    const session = await requireAuth()
    const { panelId } = await params

    await deletePanel(panelId, session.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Panel not found') {
      return NextResponse.json({ error: 'Panel not found' }, { status: 404 })
    }
    console.error('Error deleting panel:', error)
    return NextResponse.json(
      { error: 'Failed to delete panel' },
      { status: 500 }
    )
  }
}

