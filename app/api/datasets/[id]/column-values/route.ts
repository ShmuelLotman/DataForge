import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getDataset } from '@/lib/db-actions'
import { requireAuth } from '@/lib/auth-server'

/**
 * GET /api/datasets/:id/column-values?columns=Store,Category
 *
 * Returns unique values for specified columns in a dataset.
 * Used to populate multi-select filter dropdowns.
 */
export async function GET(
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

    // Get columns from query params
    const url = new URL(request.url)
    const columnsParam = url.searchParams.get('columns')

    if (!columnsParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: columns' },
        { status: 400 }
      )
    }

    const columns = columnsParam.split(',').map((c) => c.trim())

    // Validate columns exist in schema
    const schemaColumns = dataset.canonicalSchema?.map((c) => c.id) || []
    const invalidColumns = columns.filter((c) => !schemaColumns.includes(c))

    if (invalidColumns.length > 0) {
      return NextResponse.json(
        { error: `Invalid columns: ${invalidColumns.join(', ')}` },
        { status: 400 }
      )
    }

    // Fetch unique values for each column
    // Using a raw query for efficiency with JSONB
    const result: Record<string, string[]> = {}

    for (const column of columns) {
      // Query distinct values for this column
      // Limit to 1000 unique values to prevent huge responses
      const { data, error } = await supabase.rpc('get_column_distinct_values', {
        p_dataset_id: id,
        p_column_name: column,
        p_limit: 1000,
      })

      if (error) {
        // If RPC doesn't exist, fall back to manual query
        // Fallback: direct query (less efficient but works)
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('data_rows')
          .select('data')
          .eq('dataset_id', id)
          .limit(10000) // Sample for performance

        if (fallbackError) {
          result[column] = []
          continue
        }

        // Extract unique values
        const values = new Set<string>()
        fallbackData?.forEach((row) => {
          const val = row.data?.[column]
          if (val !== null && val !== undefined && val !== '') {
            values.add(String(val))
          }
        })

        result[column] = Array.from(values).sort().slice(0, 1000)
      } else {
        // RPC succeeded
        result[column] = (data || []).map((d: { value: string }) => d.value)
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to fetch column values' },
      { status: 500 }
    )
  }
}
