import { supabase } from '@/lib/supabase'
import { generateEmbedding } from './embeddings'
import type { RAGContext } from '@dataforge/types'

/**
 * Retrieve relevant context from dataset embeddings
 * Called by getDatasetContext tool - AI decides when to invoke
 *
 * Uses semantic search to find the most relevant embedded content
 * for answering questions about the dataset.
 */
export async function findRelevantContext(
  datasetId: string,
  query: string,
  options: {
    threshold?: number
    limit?: number
    contentTypes?: Array<'schema' | 'sample' | 'description' | 'statistics'>
  } = {}
): Promise<RAGContext[]> {
  // Lower default threshold for better recall - embeddings are already filtered by dataset
  const { threshold = 0.3, limit = 8 } = options

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query)

  // Search for similar embeddings
  const { data, error } = await supabase.rpc('match_dataset_embeddings', {
    p_dataset_id: datasetId,
    p_query_embedding: `[${queryEmbedding.join(',')}]`,
    p_match_threshold: threshold,
    p_match_count: limit,
  })

  if (error) {
    return []
  }

  let results = (data || []).map((item: Record<string, unknown>) => ({
    content: item.content as string,
    contentType: item.content_type as RAGContext['contentType'],
    metadata: item.metadata as Record<string, unknown>,
    similarity: item.similarity as number,
  }))

  // Filter by content type if specified
  if (options.contentTypes && options.contentTypes.length > 0) {
    results = results.filter((r) =>
      options.contentTypes!.includes(r.contentType)
    )
  }

  // Sort by similarity (highest first)
  results.sort((a, b) => b.similarity - a.similarity)

  return results
}

/**
 * Get all embeddings for a dataset (for debugging/inspection)
 */
export async function getAllDatasetEmbeddings(
  datasetId: string
): Promise<Array<{ contentType: string; content: string }>> {
  const { data, error } = await supabase
    .from('dataset_embeddings')
    .select('content_type, content')
    .eq('dataset_id', datasetId)

  if (error) {
    return []
  }

  return (data || []).map((item) => ({
    contentType: item.content_type,
    content: item.content,
  }))
}
