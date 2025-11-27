import { supabase } from './supabase'
import type { Dataset, DataFile, DataRow } from './types'

export async function getDatasets(): Promise<Dataset[]> {
  // Get datasets with file and row counts
  const { data, error } = await supabase
    .from('datasets')
    .select(
      `
      *,
      files:files(count),
      data_rows:data_rows(count)
    `
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  return data.map((d: any) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    canonicalSchema: d.canonical_schema,
    createdAt: new Date(d.created_at),
    updatedAt: new Date(d.updated_at || d.created_at),
    fileCount: d.files?.[0]?.count || 0,
    rowCount: d.data_rows?.[0]?.count || 0,
  }))
}

export async function getDataset(id: string): Promise<Dataset | null> {
  const { data, error } = await supabase
    .from('datasets')
    .select(
      `
      *,
      files:files(count),
      data_rows:data_rows(count)
    `
    )
    .eq('id', id)
    .single()

  if (error) return null

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    canonicalSchema: data.canonical_schema,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at || data.created_at),
    fileCount: data.files?.[0]?.count || 0,
    rowCount: data.data_rows?.[0]?.count || 0,
  }
}

export async function createDataset(
  dataset: Omit<
    Dataset,
    'id' | 'createdAt' | 'updatedAt' | 'fileCount' | 'rowCount'
  >
): Promise<Dataset> {
  const { data, error } = await supabase
    .from('datasets')
    .insert({
      name: dataset.name,
      description: dataset.description,
      canonical_schema: dataset.canonicalSchema,
    })
    .select()
    .single()

  if (error) throw error
  return mapDataset(data)
}

export async function addFile(
  file: Omit<DataFile, 'id' | 'uploadedAt'>
): Promise<DataFile> {
  const { data, error } = await supabase
    .from('files')
    .insert({
      dataset_id: file.datasetId,
      original_filename: file.originalFilename,
      display_name: file.displayName,
      column_schema: file.columnSchema,
      schema_fingerprint: file.schemaFingerprint,
      row_count: file.rowCount,
      period_start: file.periodStart,
      period_end: file.periodEnd,
    })
    .select()
    .single()

  if (error) throw error
  return mapFile(data)
}

// Helper to map DB snake_case to app camelCase
function mapDataset(dbDataset: any): Dataset {
  return {
    id: dbDataset.id,
    name: dbDataset.name,
    description: dbDataset.description,
    canonicalSchema: dbDataset.canonical_schema,
    createdAt: new Date(dbDataset.created_at),
    updatedAt: new Date(dbDataset.updated_at || dbDataset.created_at),
    fileCount: dbDataset.file_count || 0, // Computed column or separate query
    rowCount: dbDataset.row_count || 0, // Computed column or separate query
  }
}

function mapFile(dbFile: any): DataFile {
  return {
    id: dbFile.id,
    datasetId: dbFile.dataset_id,
    originalFilename: dbFile.original_filename,
    displayName: dbFile.display_name,
    uploadedAt: new Date(dbFile.uploaded_at),
    columnSchema: dbFile.column_schema,
    schemaFingerprint: dbFile.schema_fingerprint,
    rowCount: dbFile.row_count,
    periodStart: dbFile.period_start
      ? new Date(dbFile.period_start)
      : undefined,
    periodEnd: dbFile.period_end ? new Date(dbFile.period_end) : undefined,
  }
}

export async function addRows(
  datasetId: string,
  fileId: string,
  rows: Record<string, unknown>[],
  schema: any[] // ColumnSchema[]
): Promise<void> {
  const dateCol = schema.find((c) => c.type === 'date')?.id

  const dbRows = rows.map((row, i) => ({
    dataset_id: datasetId,
    file_id: fileId,
    row_number: i, // Note: This resets per batch if not careful. Caller should handle offset.
    parsed_date:
      dateCol && row[dateCol] ? new Date(row[dateCol] as string) : null,
    data: row,
  }))

  const { error } = await supabase.from('data_rows').insert(dbRows)
  if (error) throw error
}

export async function updateDataset(
  id: string,
  updates: Partial<Dataset>
): Promise<void> {
  const { error } = await supabase
    .from('datasets')
    .update({
      canonical_schema: updates.canonicalSchema,
      updated_at: new Date(),
    })
    .eq('id', id)

  if (error) throw error
}

export async function executeDatasetQuery(
  datasetId: string,
  config: any // JSON config for query
): Promise<any[]> {
  const { data, error } = await supabase.rpc('query_dataset', {
    p_dataset_id: datasetId,
    p_config: config,
  })

  if (error) throw error

  return data as any[]
}

// Deprecated: Use executeDatasetQuery instead
export async function getAggregatedData(
  datasetId: string,
  params: {
    xAxis: string
    yAxis: string
    groupBy: string
    startDate: Date | null
    endDate: Date | null
    bucket: 'day' | 'week' | 'month'
  }
): Promise<{ x: string; group: string; y: number }[]> {
  // Map legacy params to new config structure for backward compatibility if possible,
  // or just keep legacy RPC call if needed.
  // But since I want to force the new way:
  const config = {
    x: {
      column: params.xAxis,
      bucket: params.bucket
    },
    y: [
      { column: params.yAxis, agg: 'sum' } // Default to sum
    ],
    groupBy: params.groupBy !== 'none' ? [{ column: params.groupBy }] : [],
    filters: []
  }
  
  // If dates provided, add date filter
  // This is tricky because legacy code relied on parsed_date column.
  // The new query function uses data->>col.
  // If we want to support date ranges, we need to know which column is the date column.
  // The legacy params don't pass the date column name explicitly (it assumed inferred).
  // So we might fail to add the filter correctly without looking up the schema.
  // For now, let's just rely on the legacy RPC if we really need it, OR
  // better, just update the caller to use the new function.
  
  // Since I am updating the caller (query route), I can remove this function or leave it as is calling old RPC 
  // if I didn't delete the old RPC. (I didn't delete it).
  // But I'll keep it for safety and just add the new one.
  
  const { data, error } = await supabase.rpc('get_aggregated_data', {
    p_dataset_id: datasetId,
    p_x_axis: params.xAxis,
    p_y_axis: params.yAxis,
    p_group_by: params.groupBy === 'none' ? null : params.groupBy,
    p_start_date: params.startDate?.toISOString() || null,
    p_end_date: params.endDate?.toISOString() || null,
    p_bucket: params.bucket,
  })

  if (error) throw error

  return (data as any[]).map((row) => ({
    x: row.x_value,
    group: row.group_value,
    y: Number(row.y_value),
  }))
}

export async function getFiles(datasetId: string): Promise<DataFile[]> {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('uploaded_at', { ascending: false })

  if (error) throw error
  return data.map(mapFile)
}

export async function deleteDataset(id: string): Promise<void> {
  const { error } = await supabase.from('datasets').delete().eq('id', id)

  if (error) throw error
}

export async function updateDatasetDetails(
  id: string,
  updates: { name?: string; description?: string }
): Promise<Dataset> {
  const { data, error } = await supabase
    .from('datasets')
    .update({
      name: updates.name,
      description: updates.description,
      updated_at: new Date(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return mapDataset(data)
}
