import { NextResponse } from 'next/server'

// This route is no longer needed since we use server-side aggregation
// Keeping it for backwards compatibility but returning empty array
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json([])
}
