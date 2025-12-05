import { supabase } from '@/lib/supabase'
import { generateEmbedding } from './embeddings'
import type { RAGContext } from '@dataforge/types'

/**
 * Retrieve relevant context from dataset embeddings
 * Called by getDatasetContext tool - AI decides when to invoke
 */
export async function findRelevantContext(
  datasetId: string,
  query: string,
  options: {
    threshold?: number
    limit?: number
  } = {}
): Promise<RAGContext[]> {
  const { threshold = 0.5, limit = 5 } = options

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
    console.error('RAG retrieval error:', error)
    return []
  }

  return (data || []).map((item: Record<string, unknown>) => ({
    content: item.content as string,
    contentType: item.content_type as RAGContext['contentType'],
    metadata: item.metadata as Record<string, unknown>,
    similarity: item.similarity as number,
  }))
}

