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
  limit: number = 100
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('data_rows')
    .select('data')
    .eq('dataset_id', datasetId)
    .limit(limit)

  if (error) {
    console.error('Error fetching sample data:', error)
    return []
  }

  return (data || []).map((row) => row.data as Record<string, unknown>)
}

/**
 * Generate and store embeddings for a dataset
 * Called when: dataset created, schema updated, files added
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

  // 1. Schema embedding
  if (dataset.canonicalSchema) {
    const schemaDescription = formatSchemaForEmbedding(dataset.canonicalSchema)
    const schemaEmbedding = await generateEmbedding(schemaDescription)
    embeddings.push({
      dataset_id: datasetId,
      content_type: 'schema',
      content: schemaDescription,
      embedding: schemaEmbedding,
      metadata: {
        columns: dataset.canonicalSchema.map((c) => c.id),
        types: Object.fromEntries(
          dataset.canonicalSchema.map((c) => [c.id, c.type])
        ),
      },
    })
  }

  // 2. Dataset description embedding
  if (dataset.description) {
    const descEmbedding = await generateEmbedding(dataset.description)
    embeddings.push({
      dataset_id: datasetId,
      content_type: 'description',
      content: dataset.description,
      embedding: descEmbedding,
      metadata: { name: dataset.name },
    })
  }

  // 3. Sample data embeddings (chunked)
  let actualSampleData = sampleData
  if (!actualSampleData) {
    actualSampleData = await getDatasetSampleData(datasetId, 100)
  }

  if (actualSampleData && actualSampleData.length > 0) {
    const chunks = chunkSampleData(actualSampleData, dataset.canonicalSchema || [])
    const sampleEmbeddings = await generateEmbeddings(chunks)
    for (const { content, embedding } of sampleEmbeddings) {
      embeddings.push({
        dataset_id: datasetId,
        content_type: 'sample',
        content,
        embedding,
        metadata: { row_count: actualSampleData.length },
      })
    }
  }

  // 4. Delete existing embeddings and insert new ones
  await supabase.from('dataset_embeddings').delete().eq('dataset_id', datasetId)

  if (embeddings.length > 0) {
    // Format embeddings for pgvector (array to string)
    const formattedEmbeddings = embeddings.map((e) => ({
      ...e,
      embedding: `[${e.embedding.join(',')}]`,
    }))
    await supabase.from('dataset_embeddings').insert(formattedEmbeddings)
  }
}

/**
 * Format schema into natural language for embedding
 */
function formatSchemaForEmbedding(schema: ColumnSchema[]): string {
  const columns = schema
    .map((col) => {
      const parts = [`${col.label || col.id} (${col.type})`]
      if (col.role) parts.push(`role: ${col.role}`)
      return parts.join(', ')
    })
    .join('; ')

  return `Dataset columns: ${columns}`
}

/**
 * Chunk sample data into embeddable pieces
 */
function chunkSampleData(
  data: Record<string, unknown>[],
  schema: ColumnSchema[]
): string[] {
  const chunks: string[] = []
  const chunkSize = 20 // rows per chunk

  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.slice(i, i + chunkSize)
    const summary = summarizeDataChunk(slice, schema)
    chunks.push(summary)
  }

  return chunks
}

/**
 * Summarize a data chunk into natural language
 */
function summarizeDataChunk(
  rows: Record<string, unknown>[],
  schema: ColumnSchema[]
): string {
  const metrics = schema.filter((c) => c.role === 'metric')
  const dimensions = schema.filter((c) => c.role === 'dimension')

  const parts: string[] = [`Sample of ${rows.length} rows.`]

  // Summarize dimension values
  for (const dim of dimensions.slice(0, 3)) {
    const values = [...new Set(rows.map((r) => String(r[dim.id])))]
    if (values.length <= 5) {
      parts.push(`${dim.label || dim.id} values: ${values.join(', ')}`)
    } else {
      parts.push(
        `${dim.label || dim.id}: ${
          values.length
        } unique values including ${values.slice(0, 3).join(', ')}`
      )
    }
  }

  // Summarize metric ranges
  for (const met of metrics.slice(0, 3)) {
    const values = rows.map((r) => Number(r[met.id])).filter((n) => !isNaN(n))
    if (values.length > 0) {
      const min = Math.min(...values)
      const max = Math.max(...values)
      parts.push(`${met.label || met.id} ranges from ${min} to ${max}`)
    }
  }

  return parts.join(' ')
}

