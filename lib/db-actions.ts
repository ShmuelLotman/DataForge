import { supabase } from './supabase'
import type {
  Dataset,
  DataFile,
  DataRow,
  Dashboard,
  DashboardPanel,
  DashboardPanelWithDataset,
  DashboardWithPanels,
  DashboardWithDataset,
  ChartConfig,
  ChartFilter,
} from './types'

export async function getDatasets(userId: string): Promise<Dataset[]> {
  // Get datasets with file and row counts, filtered by user
  const { data, error } = await supabase
    .from('datasets')
    .select(
      `
      *,
      files:files(count),
      data_rows:data_rows(count)
    `
    )
    .eq('user_id', userId)
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

export async function getDataset(
  id: string,
  userId?: string
): Promise<Dataset | null> {
  let query = supabase
    .from('datasets')
    .select(
      `
      *,
      files:files(count),
      data_rows:data_rows(count)
    `
    )
    .eq('id', id)

  // If userId provided, verify ownership
  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query.single()

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
  >,
  userId: string
): Promise<Dataset> {
  const { data, error } = await supabase
    .from('datasets')
    .insert({
      name: dataset.name,
      description: dataset.description,
      canonical_schema: dataset.canonicalSchema,
      user_id: userId,
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

/**
 * Estimate JSON payload size in bytes
 */
function estimatePayloadSize(rows: any[]): number {
  // Rough estimation: JSON.stringify overhead + average row size
  // This is conservative - actual size may be smaller due to compression
  return JSON.stringify(rows).length
}

/**
 * Maximum safe payload size (2MB) - Reduced to avoid timeouts on Supabase.
 * Wide datasets (many columns) cause significant JSON expansion.
 */
const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024 // 2MB (reduced from 5MB)

/**
 * Maximum rows per insert to avoid statement timeouts.
 * Supabase has default statement timeouts (often 60s).
 * Smaller inserts = faster completion = less chance of timeout.
 */
const MAX_ROWS_PER_INSERT = 100

/**
 * Retry configuration for transient errors
 */
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if error is retryable (timeout or connection issue)
 */
function isRetryableError(error: any): boolean {
  if (!error) return false
  // PostgreSQL error codes that are retryable
  const retryableCodes = [
    '57014', // query_canceled (statement timeout)
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
  ]
  return retryableCodes.includes(error.code)
}

/**
 * Insert a chunk with retry logic for transient failures
 */
async function insertChunkWithRetry(
  chunk: any[],
  chunkIndex: number,
  totalChunks: number
): Promise<void> {
  let lastError: any = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase.from('data_rows').insert(chunk)

    if (!error) {
      return // Success
    }

    lastError = error

    if (isRetryableError(error) && attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * attempt // Exponential-ish backoff
      await sleep(delay)
    } else {
      break // Non-retryable or max retries reached
    }
  }

  // If we get here, all retries failed
  throw lastError
}

export async function addRows(
  datasetId: string,
  fileId: string,
  rows: Record<string, unknown>[],
  schema: any[], // ColumnSchema[]
  rowOffset: number = 0
): Promise<void> {
  const dateCol = schema.find((c) => c.type === 'date')?.id
  const columnCount = Object.keys(rows[0] || {}).length

  // Prepare all rows
  const dbRows = rows.map((row, i) => ({
    dataset_id: datasetId,
    file_id: fileId,
    row_number: rowOffset + i,
    parsed_date:
      dateCol && row[dateCol] ? new Date(row[dateCol] as string) : null,
    data: row,
  }))

  // Determine optimal chunk size based on column count and payload size
  // Wide datasets need smaller chunks to avoid timeouts
  const baseChunkSize = columnCount > 50 ? 25 : columnCount > 30 ? 50 : MAX_ROWS_PER_INSERT
  const payloadSize = estimatePayloadSize(dbRows)
  const avgRowSize = dbRows.length > 0 ? payloadSize / dbRows.length : 0

  // Calculate chunk size that stays under payload limit
  let chunkSize = baseChunkSize
  if (avgRowSize > 0) {
    const payloadBasedChunkSize = Math.floor(MAX_PAYLOAD_SIZE / avgRowSize)
    chunkSize = Math.max(1, Math.min(chunkSize, payloadBasedChunkSize))
  }

  // Split into chunks and insert with retry logic
  const chunks: any[][] = []
  for (let i = 0; i < dbRows.length; i += chunkSize) {
    chunks.push(dbRows.slice(i, i + chunkSize))
  }

  // Insert chunks sequentially (parallel would cause more timeouts)
  for (let i = 0; i < chunks.length; i++) {
    await insertChunkWithRetry(chunks[i], i, chunks.length)
  }
}

export async function updateDataset(
  id: string,
  updates: Partial<Dataset>,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('datasets')
    .update({
      canonical_schema: updates.canonicalSchema,
      updated_at: new Date(),
    })
    .eq('id', id)
    .eq('user_id', userId)

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
      bucket: params.bucket,
    },
    y: [
      { column: params.yAxis, agg: 'sum' }, // Default to sum
    ],
    groupBy: params.groupBy !== 'none' ? [{ column: params.groupBy }] : [],
    filters: [],
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

export async function getFiles(
  datasetId: string,
  userId: string
): Promise<DataFile[]> {
  // First verify the dataset belongs to the user
  const dataset = await getDataset(datasetId, userId)
  if (!dataset) {
    throw new Error('Dataset not found or access denied')
  }

  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('uploaded_at', { ascending: false })

  if (error) throw error
  return data.map(mapFile)
}

export async function deleteDataset(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('datasets')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}

export async function updateDatasetDetails(
  id: string,
  updates: { name?: string; description?: string },
  userId: string
): Promise<Dataset> {
  const { data, error } = await supabase
    .from('datasets')
    .update({
      name: updates.name,
      description: updates.description,
      updated_at: new Date(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return mapDataset(data)
}

// ============================================
// DASHBOARDS
// ============================================

export async function getDashboards(
  userId: string
): Promise<DashboardWithDataset[]> {
  const { data, error } = await supabase
    .from('dashboards')
    .select(
      `
      *,
      datasets:dataset_id (
        id,
        name,
        data_rows (count)
      ),
      dashboard_panels (id)
    `
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return data.map((row: any) => ({
    ...transformDashboard(row),
    dataset: row.datasets
      ? {
          id: row.datasets.id,
          name: row.datasets.name,
          rowCount: row.datasets.data_rows?.[0]?.count || 0,
        }
      : null,
    panelCount: row.dashboard_panels?.length || 0,
  }))
}

export async function getDashboard(
  id: string,
  userId: string
): Promise<DashboardWithPanels | null> {
  const { data, error } = await supabase
    .from('dashboards')
    .select(
      `
      *,
      dashboard_panels (
        *,
        panel_datasets (
          dataset_id,
          is_primary
        ),
        datasets:dataset_id (
          id,
          name,
          canonical_schema
        )
      )
    `
    )
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return {
    ...transformDashboard(data),
    panels: (data.dashboard_panels || [])
      .map(transformPanelWithDataset)
      .sort(
        (a: DashboardPanelWithDataset, b: DashboardPanelWithDataset) =>
          a.sortOrder - b.sortOrder
      ),
  }
}

export async function createDashboard(
  dashboard: {
    datasetId?: string | null
    name: string
    description?: string
  },
  userId: string
): Promise<Dashboard> {
  const { data, error } = await supabase
    .from('dashboards')
    .insert({
      user_id: userId,
      dataset_id: dashboard.datasetId || null,
      name: dashboard.name,
      description: dashboard.description,
    })
    .select()
    .single()

  if (error) throw error
  return transformDashboard(data)
}

export async function updateDashboard(
  id: string,
  updates: Partial<Pick<Dashboard, 'name' | 'description' | 'defaultFilters'>>,
  userId: string
): Promise<Dashboard> {
  const { data, error } = await supabase
    .from('dashboards')
    .update({
      ...(updates.name && { name: updates.name }),
      ...(updates.description !== undefined && {
        description: updates.description,
      }),
      ...(updates.defaultFilters !== undefined && {
        default_filters: updates.defaultFilters,
      }),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return transformDashboard(data)
}

/**
 * Update only the default filters for a dashboard
 */
export async function updateDashboardFilters(
  id: string,
  filters: ChartFilter[],
  userId: string
): Promise<Dashboard> {
  return updateDashboard(id, { defaultFilters: filters }, userId)
}

export async function deleteDashboard(
  id: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('dashboards')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}

// ============================================
// DASHBOARD PANELS
// ============================================

export async function addPanel(
  dashboardId: string,
  panel: {
    datasetId: string
    title: string
    config: ChartConfig
  },
  userId: string
): Promise<DashboardPanelWithDataset> {
  // First verify dashboard ownership
  const dashboard = await getDashboard(dashboardId, userId)
  if (!dashboard) throw new Error('Dashboard not found')

  // Build dataset list (primary + blended)
  const datasetIds = Array.from(
    new Set(
      panel.config.datasetIds && panel.config.datasetIds.length > 0
        ? panel.config.datasetIds
        : [panel.datasetId]
    )
  )
  const primaryDatasetId = datasetIds[0]

  // Verify dataset ownership for all involved datasets
  await Promise.all(
    datasetIds.map(async (id) => {
      const ds = await getDataset(id, userId)
      if (!ds) throw new Error('Dataset not found')
    })
  )

  // Get next sort order
  const maxSort = Math.max(0, ...dashboard.panels.map((p) => p.sortOrder))

  const { data, error } = await supabase
    .from('dashboard_panels')
    .insert({
      dashboard_id: dashboardId,
      dataset_id: primaryDatasetId,
      title: panel.title,
      config: { ...panel.config, datasetIds },
      sort_order: maxSort + 1,
    })
    .select(
      `
      *,
      panel_datasets (
        dataset_id,
        is_primary
      ),
      datasets:dataset_id (
        id,
        name,
        canonical_schema
      )
    `
    )
    .single()

  if (error) throw error
  const createdPanel = transformPanelWithDataset(data)

  // Sync panel_datasets
  const rows = datasetIds.map((id) => ({
    panel_id: createdPanel.id,
    dataset_id: id,
    is_primary: id === primaryDatasetId,
  }))
  await supabase.from('panel_datasets').upsert(rows, {
    onConflict: 'panel_id,dataset_id',
    ignoreDuplicates: false,
  })

  return {
    ...createdPanel,
    datasetIds,
  }
}

export async function updatePanel(
  panelId: string,
  updates: Partial<Pick<DashboardPanel, 'title' | 'config' | 'sortOrder' | 'datasetId'>>,
  userId: string
): Promise<DashboardPanelWithDataset> {
  // Verify ownership through dashboard
  const { data: panel } = await supabase
    .from('dashboard_panels')
    .select('dashboard_id, dataset_id, config')
    .eq('id', panelId)
    .single()

  if (!panel) throw new Error('Panel not found')

  const dashboard = await getDashboard(panel.dashboard_id, userId)
  if (!dashboard) throw new Error('Unauthorized')

  // Determine dataset list to enforce ownership + primary
  const baseConfig: ChartConfig =
    (updates.config as ChartConfig | undefined) ||
    ((panel as any).config as ChartConfig)

  const configDatasetIds =
    baseConfig?.datasetIds && baseConfig.datasetIds.length > 0
      ? baseConfig.datasetIds
      : undefined

  const datasetIds = Array.from(
    new Set(
      configDatasetIds ??
        [updates.datasetId ?? (panel as any).dataset_id].filter(Boolean)
    )
  )
  const primaryDatasetId = datasetIds[0]

  await Promise.all(
    datasetIds.map(async (id) => {
      const ds = await getDataset(id, userId)
      if (!ds) throw new Error('Dataset not found')
    })
  )

  const configToSave = { ...baseConfig, datasetIds }

  const { data, error } = await supabase
    .from('dashboard_panels')
    .update({
      ...(updates.title && { title: updates.title }),
      ...(configToSave && { config: configToSave }),
      ...(updates.sortOrder !== undefined && { sort_order: updates.sortOrder }),
      ...(primaryDatasetId && { dataset_id: primaryDatasetId }),
    })
    .eq('id', panelId)
    .select(
      `
      *,
      panel_datasets (
        dataset_id,
        is_primary
      ),
      datasets:dataset_id (
        id,
        name,
        canonical_schema
      )
    `
    )
    .single()

  if (error) throw error

  // Reset panel_datasets to match current list
  await supabase.from('panel_datasets').delete().eq('panel_id', panelId)
  const rows = datasetIds.map((id) => ({
    panel_id: panelId,
    dataset_id: id,
    is_primary: id === primaryDatasetId,
  }))
  await supabase.from('panel_datasets').upsert(rows, {
    onConflict: 'panel_id,dataset_id',
    ignoreDuplicates: false,
  })

  const updated = transformPanelWithDataset(data)
  return {
    ...updated,
    datasetIds,
  }
}

export async function deletePanel(
  panelId: string,
  userId: string
): Promise<void> {
  // Verify ownership through dashboard
  const { data: panel } = await supabase
    .from('dashboard_panels')
    .select('dashboard_id')
    .eq('id', panelId)
    .single()

  if (!panel) throw new Error('Panel not found')

  const dashboard = await getDashboard(panel.dashboard_id, userId)
  if (!dashboard) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('dashboard_panels')
    .delete()
    .eq('id', panelId)

  if (error) throw error
}

export async function reorderPanels(
  dashboardId: string,
  panelIds: string[],
  userId: string
): Promise<void> {
  // Verify ownership
  const dashboard = await getDashboard(dashboardId, userId)
  if (!dashboard) throw new Error('Unauthorized')

  // Update sort orders
  const updates = panelIds.map((id, index) =>
    supabase.from('dashboard_panels').update({ sort_order: index }).eq('id', id)
  )

  await Promise.all(updates)
}

// ============================================
// DASHBOARD TRANSFORMERS
// ============================================

function transformDashboard(row: any): Dashboard {
  return {
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    name: row.name,
    description: row.description,
    defaultFilters: row.default_filters || [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function transformPanel(row: any): DashboardPanel {
  const datasetIds: string[] | undefined = row.panel_datasets
    ? row.panel_datasets
        .sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary))
        .map((pd: any) => pd.dataset_id)
    : undefined

  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    datasetId: row.dataset_id,
    title: row.title,
    config: row.config,
    sortOrder: row.sort_order || 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(datasetIds && { datasetIds }),
  }
}

function transformPanelWithDataset(row: any): DashboardPanelWithDataset {
  return {
    ...transformPanel(row),
    dataset: {
      id: row.datasets.id,
      name: row.datasets.name,
      canonicalSchema: row.datasets.canonical_schema,
    },
  }
}
