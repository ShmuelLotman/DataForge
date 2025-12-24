import { embed, embedMany } from 'ai'
import { openai } from '@ai-sdk/openai'
import { supabase } from '@/lib/supabase'
import type { Dataset, ColumnSchema } from '@dataforge/types'

const embeddingModel = openai.embedding('text-embedding-3-small')

/**
 * Generate a single embedding for a text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text.replaceAll('\n', ' ').trim(),
  })
  return embedding
}

/**
 * Generate embeddings for multiple text chunks
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<Array<{ content: string; embedding: number[] }>> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: texts.map((t) => t.replaceAll('\n', ' ').trim()),
  })
  return texts.map((content, i) => ({ content, embedding: embeddings[i] }))
}

/**
 * Get sample data rows from a dataset
 */
async function getDatasetSampleData(
  datasetId: string,
  limit: number = 5000
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('data_rows')
    .select('data')
    .eq('dataset_id', datasetId)
    .limit(limit)

  if (error) {
    return []
  }

  return (data || []).map((row) => row.data as Record<string, unknown>)
}

/**
 * Get total row count for a dataset
 */
async function getDatasetRowCount(datasetId: string): Promise<number> {
  const { count, error } = await supabase
    .from('data_rows')
    .select('*', { count: 'exact', head: true })
    .eq('dataset_id', datasetId)

  if (error) {
    return 0
  }

  return count || 0
}

/**
 * Get date range for a dataset (if it has date columns)
 */
async function getDatasetDateRange(
  datasetId: string
): Promise<{ min: string; max: string } | null> {
  const { data, error } = await supabase
    .from('data_rows')
    .select('parsed_date')
    .eq('dataset_id', datasetId)
    .not('parsed_date', 'is', null)
    .order('parsed_date', { ascending: true })
    .limit(1)

  if (error || !data || data.length === 0) return null

  const { data: maxData } = await supabase
    .from('data_rows')
    .select('parsed_date')
    .eq('dataset_id', datasetId)
    .not('parsed_date', 'is', null)
    .order('parsed_date', { ascending: false })
    .limit(1)

  if (!maxData || maxData.length === 0) return null

  return {
    min: data[0].parsed_date,
    max: maxData[0].parsed_date,
  }
}

// ============================================
// STATISTICS CALCULATION (Schema-Driven)
// ============================================

interface ColumnStatistics {
  column: string
  label: string
  type: string
  role: string
  // For numeric columns
  min?: number
  max?: number
  sum?: number
  avg?: number
  // For all columns
  uniqueCount?: number
  nullCount?: number
  sampleValues?: string[]
  // For date columns
  dateMin?: string
  dateMax?: string
}

/**
 * Calculate statistics for each column based on its type
 * Generic approach - works for any dataset structure
 */
function calculateColumnStatistics(
  data: Record<string, unknown>[],
  schema: ColumnSchema[]
): ColumnStatistics[] {
  const stats: ColumnStatistics[] = []

  for (const col of schema) {
    const values = data.map((row) => row[col.id])
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ''
    )

    const colStats: ColumnStatistics = {
      column: col.id,
      label: col.label || col.id,
      type: col.type,
      role: col.role,
      nullCount: values.length - nonNullValues.length,
    }

    if (col.type === 'number') {
      const numericValues = nonNullValues
        .map((v) => Number(v))
        .filter((n) => !isNaN(n))

      if (numericValues.length > 0) {
        colStats.min = Math.min(...numericValues)
        colStats.max = Math.max(...numericValues)
        colStats.sum = numericValues.reduce((a, b) => a + b, 0)
        colStats.avg = colStats.sum / numericValues.length
      }
    } else if (col.type === 'date') {
      const dateValues = nonNullValues
        .map((v) => new Date(String(v)))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime())

      if (dateValues.length > 0) {
        colStats.dateMin = dateValues[0].toISOString().split('T')[0]
        colStats.dateMax = dateValues[dateValues.length - 1]
          .toISOString()
          .split('T')[0]
      }
    }

    // For dimensions (string/categorical), get unique values
    if (col.role === 'dimension' || col.type === 'string') {
      const uniqueValues = [...new Set(nonNullValues.map((v) => String(v)))]
      colStats.uniqueCount = uniqueValues.length

      // Store sample values (up to 10 for small cardinality, 5 for large)
      const sampleCount = uniqueValues.length <= 20 ? uniqueValues.length : 5
      colStats.sampleValues = uniqueValues.slice(0, sampleCount)
    }

    stats.push(colStats)
  }

  return stats
}

// ============================================
// EMBEDDING GENERATION (Generic & Scalable)
// ============================================

/**
 * Generate and store embeddings for a dataset
 * Called when: dataset created, schema updated, files added
 *
 * This is schema-driven and works for any dataset structure:
 * - Generates rich schema descriptions
 * - Calculates statistics based on column types
 * - Creates semantic summaries for RAG retrieval
 */
export async function generateDatasetEmbeddings(
  datasetId: string,
  dataset: Dataset,
  sampleData?: Record<string, unknown>[]
): Promise<void> {
  const embeddings: Array<{
    dataset_id: string
    content_type: string
    content: string
    embedding: number[]
    metadata: Record<string, unknown>
  }> = []

  const schema = dataset.canonicalSchema || []
  if (schema.length === 0) {
    return
  }

  // Fetch sample data if not provided (get more for better statistics)
  let actualSampleData = sampleData
  if (!actualSampleData) {
    actualSampleData = await getDatasetSampleData(datasetId, 500)
  }

  // Get total row count and date range
  const totalRowCount = await getDatasetRowCount(datasetId)
  const dateRange = await getDatasetDateRange(datasetId)

  // Calculate column statistics
  const columnStats = calculateColumnStatistics(actualSampleData, schema)

  // ============================================
  // 1. DATASET OVERVIEW EMBEDDING
  // ============================================
  const overviewText = formatDatasetOverview(
    dataset,
    totalRowCount,
    dateRange,
    columnStats
  )
  const overviewEmbedding = await generateEmbedding(overviewText)
  embeddings.push({
    dataset_id: datasetId,
    content_type: 'description',
    content: overviewText,
    embedding: overviewEmbedding,
    metadata: {
      name: dataset.name,
      rowCount: totalRowCount,
      columnCount: schema.length,
      hasDateColumn: !!dateRange,
    },
  })

  // ============================================
  // 2. DETAILED SCHEMA EMBEDDING
  // ============================================
  const schemaText = formatDetailedSchema(schema, columnStats)
  const schemaEmbedding = await generateEmbedding(schemaText)
  embeddings.push({
    dataset_id: datasetId,
    content_type: 'schema',
    content: schemaText,
    embedding: schemaEmbedding,
    metadata: {
      columns: schema.map((c) => c.id),
      types: Object.fromEntries(schema.map((c) => [c.id, c.type])),
      roles: Object.fromEntries(schema.map((c) => [c.id, c.role])),
    },
  })

  // ============================================
  // 3. STATISTICS EMBEDDINGS (Per Column Type)
  // ============================================
  // Group statistics by type for better semantic retrieval
  const metricStats = columnStats.filter((s) => s.role === 'metric')
  const dimensionStats = columnStats.filter((s) => s.role === 'dimension')
  const dateStats = columnStats.filter((s) => s.type === 'date')

  // Metric statistics embedding
  if (metricStats.length > 0) {
    const metricText = formatMetricStatistics(metricStats, totalRowCount)
    const metricEmbedding = await generateEmbedding(metricText)
    embeddings.push({
      dataset_id: datasetId,
      content_type: 'statistics',
      content: metricText,
      embedding: metricEmbedding,
      metadata: {
        statType: 'metrics',
        columns: metricStats.map((s) => s.column),
      },
    })
  }

  // Dimension statistics embedding
  if (dimensionStats.length > 0) {
    const dimensionText = formatDimensionStatistics(dimensionStats)
    const dimensionEmbedding = await generateEmbedding(dimensionText)
    embeddings.push({
      dataset_id: datasetId,
      content_type: 'statistics',
      content: dimensionText,
      embedding: dimensionEmbedding,
      metadata: {
        statType: 'dimensions',
        columns: dimensionStats.map((s) => s.column),
      },
    })
  }

  // Date range embedding (if applicable)
  if (dateStats.length > 0 || dateRange) {
    const dateText = formatDateStatistics(dateStats, dateRange)
    const dateEmbedding = await generateEmbedding(dateText)
    embeddings.push({
      dataset_id: datasetId,
      content_type: 'statistics',
      content: dateText,
      embedding: dateEmbedding,
      metadata: {
        statType: 'dates',
        dateRange: dateRange,
      },
    })
  }

  // ============================================
  // 4. SAMPLE DATA EMBEDDINGS (Chunked)
  // ============================================
  if (actualSampleData.length > 0) {
    const chunks = chunkSampleData(actualSampleData, schema)
    const sampleEmbeddings = await generateEmbeddings(chunks)
    for (let i = 0; i < sampleEmbeddings.length; i++) {
      const { content, embedding } = sampleEmbeddings[i]
      embeddings.push({
        dataset_id: datasetId,
        content_type: 'sample',
        content,
        embedding,
        metadata: {
          chunkIndex: i,
          totalChunks: sampleEmbeddings.length,
          rowCount: actualSampleData.length,
        },
      })
    }
  }

  // ============================================
  // 5. USER DESCRIPTION EMBEDDING (if provided)
  // ============================================
  if (dataset.description && dataset.description.trim()) {
    const descEmbedding = await generateEmbedding(dataset.description)
    embeddings.push({
      dataset_id: datasetId,
      content_type: 'description',
      content: `User description: ${dataset.description}`,
      embedding: descEmbedding,
      metadata: { source: 'user_provided' },
    })
  }

  // ============================================
  // STORE EMBEDDINGS
  // ============================================
  await supabase.from('dataset_embeddings').delete().eq('dataset_id', datasetId)

  if (embeddings.length > 0) {
    const formattedEmbeddings = embeddings.map((e) => ({
      ...e,
      embedding: `[${e.embedding.join(',')}]`,
    }))

    const { error } = await supabase
      .from('dataset_embeddings')
      .insert(formattedEmbeddings)

    if (error) {
      // Silently handle embedding storage errors
    }
  }
}

// ============================================
// FORMATTING FUNCTIONS (Natural Language)
// ============================================

/**
 * Format dataset overview for embedding
 */
function formatDatasetOverview(
  dataset: Dataset,
  rowCount: number,
  dateRange: { min: string; max: string } | null,
  stats: ColumnStatistics[]
): string {
  const parts: string[] = []

  parts.push(
    `Dataset "${dataset.name}" contains ${rowCount.toLocaleString()} rows.`
  )

  const metricCount = stats.filter((s) => s.role === 'metric').length
  const dimensionCount = stats.filter((s) => s.role === 'dimension').length

  parts.push(
    `It has ${stats.length} columns: ${metricCount} metric${
      metricCount !== 1 ? 's' : ''
    } (numeric values) and ${dimensionCount} dimension${
      dimensionCount !== 1 ? 's' : ''
    } (categorical/grouping values).`
  )

  if (dateRange) {
    parts.push(`The data spans from ${dateRange.min} to ${dateRange.max}.`)
  }

  // Add column names
  const columnNames = stats.map((s) => s.label).join(', ')
  parts.push(`Columns: ${columnNames}.`)

  return parts.join(' ')
}

/**
 * Format detailed schema for embedding
 */
function formatDetailedSchema(
  schema: ColumnSchema[],
  stats: ColumnStatistics[]
): string {
  const parts: string[] = ['Dataset schema and column details:']

  for (const col of schema) {
    const colStat = stats.find((s) => s.column === col.id)
    const colParts: string[] = []

    colParts.push(
      `"${col.label || col.id}" is a ${col.type} column used as a ${col.role}`
    )

    if (colStat) {
      if (col.type === 'number' && colStat.min !== undefined) {
        colParts.push(
          `with values ranging from ${colStat.min.toLocaleString()} to ${colStat.max?.toLocaleString()}`
        )
        if (colStat.avg !== undefined) {
          colParts.push(
            `(average: ${colStat.avg.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })})`
          )
        }
      } else if (col.type === 'date' && colStat.dateMin) {
        colParts.push(`spanning from ${colStat.dateMin} to ${colStat.dateMax}`)
      } else if (colStat.uniqueCount !== undefined) {
        colParts.push(`with ${colStat.uniqueCount} unique values`)
        if (colStat.sampleValues && colStat.sampleValues.length > 0) {
          const samples = colStat.sampleValues.slice(0, 5).join(', ')
          colParts.push(`including: ${samples}`)
        }
      }
    }

    parts.push(colParts.join(' ') + '.')
  }

  return parts.join(' ')
}

/**
 * Format metric statistics for embedding
 */
function formatMetricStatistics(
  stats: ColumnStatistics[],
  totalRows: number
): string {
  const parts: string[] = ['Numeric metric statistics:']

  for (const stat of stats) {
    if (stat.min !== undefined && stat.max !== undefined) {
      const statParts = [
        `"${
          stat.label
        }" ranges from ${stat.min.toLocaleString()} to ${stat.max.toLocaleString()}`,
      ]

      if (stat.sum !== undefined) {
        statParts.push(`total sum: ${stat.sum.toLocaleString()}`)
      }
      if (stat.avg !== undefined) {
        statParts.push(
          `average: ${stat.avg.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}`
        )
      }

      parts.push(statParts.join(', ') + '.')
    }
  }

  parts.push(`Based on ${totalRows.toLocaleString()} total records.`)

  return parts.join(' ')
}

/**
 * Format dimension statistics for embedding
 */
function formatDimensionStatistics(stats: ColumnStatistics[]): string {
  const parts: string[] = ['Categorical dimension values:']

  for (const stat of stats) {
    const statParts = [`"${stat.label}" has ${stat.uniqueCount} unique values`]

    if (stat.sampleValues && stat.sampleValues.length > 0) {
      // If low cardinality, list all values
      if (stat.uniqueCount && stat.uniqueCount <= 15) {
        statParts.push(`(all values: ${stat.sampleValues.join(', ')})`)
      } else {
        statParts.push(
          `(examples: ${stat.sampleValues.slice(0, 5).join(', ')})`
        )
      }
    }

    parts.push(statParts.join(' ') + '.')
  }

  return parts.join(' ')
}

/**
 * Format date statistics for embedding
 */
function formatDateStatistics(
  stats: ColumnStatistics[],
  dateRange: { min: string; max: string } | null
): string {
  const parts: string[] = ['Date and time information:']

  if (dateRange) {
    parts.push(
      `The dataset contains data from ${dateRange.min} to ${dateRange.max}.`
    )
  }

  for (const stat of stats) {
    if (stat.dateMin && stat.dateMax) {
      parts.push(
        `Column "${stat.label}" spans from ${stat.dateMin} to ${stat.dateMax}.`
      )
    }
  }

  return parts.join(' ')
}

/**
 * Chunk sample data into embeddable pieces
 */
function chunkSampleData(
  data: Record<string, unknown>[],
  schema: ColumnSchema[]
): string[] {
  const chunks: string[] = []
  const chunkSize = 25 // rows per chunk

  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.slice(i, i + chunkSize)
    const summary = summarizeDataChunk(slice, schema, i, data.length)
    chunks.push(summary)
  }

  return chunks
}

/**
 * Summarize a data chunk into natural language
 */
function summarizeDataChunk(
  rows: Record<string, unknown>[],
  schema: ColumnSchema[],
  startIndex: number,
  totalRows: number
): string {
  const metrics = schema.filter((c) => c.role === 'metric')
  const dimensions = schema.filter((c) => c.role === 'dimension')
  const dateColumns = schema.filter((c) => c.type === 'date')

  const parts: string[] = [
    `Sample rows ${startIndex + 1}-${
      startIndex + rows.length
    } of ${totalRows}:`,
  ]

  // Summarize date range in this chunk
  for (const dateCol of dateColumns.slice(0, 1)) {
    const dates = rows
      .map((r) => r[dateCol.id])
      .filter((d) => d)
      .map((d) => new Date(String(d)))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())

    if (dates.length > 0) {
      const minDate = dates[0].toISOString().split('T')[0]
      const maxDate = dates[dates.length - 1].toISOString().split('T')[0]
      parts.push(`Date range: ${minDate} to ${maxDate}.`)
    }
  }

  // Summarize dimension values in this chunk
  for (const dim of dimensions.slice(0, 3)) {
    const values = [
      ...new Set(rows.map((r) => String(r[dim.id] ?? ''))),
    ].filter((v) => v !== '' && v !== 'undefined' && v !== 'null')

    if (values.length > 0) {
      if (values.length <= 5) {
        parts.push(`${dim.label || dim.id}: ${values.join(', ')}.`)
      } else {
        parts.push(
          `${dim.label || dim.id}: ${values.length} values including ${values
            .slice(0, 3)
            .join(', ')}.`
        )
      }
    }
  }

  // Summarize metric ranges in this chunk
  for (const met of metrics.slice(0, 3)) {
    const values = rows.map((r) => Number(r[met.id])).filter((n) => !isNaN(n))

    if (values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      const sum = values.reduce((a, b) => a + b, 0)
      parts.push(
        `${
          met.label || met.id
        }: ${min.toLocaleString()}-${max.toLocaleString()} (sum: ${sum.toLocaleString()}).`
      )
    }
  }

  return parts.join(' ')
}
