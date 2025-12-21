-- Migration: 007_ai_features.sql
-- AI Chat and RAG features for DataForge

-- ============================================
-- PGVECTOR EXTENSION
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- AI CHAT SESSIONS
-- ============================================
-- Each session is tied to ONE dataset and ONE user
CREATE TABLE ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,

  -- Session metadata
  title TEXT, -- Auto-generated from first message or user-defined

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ai_chat_sessions_user ON ai_chat_sessions(user_id);
CREATE INDEX idx_ai_chat_sessions_dataset ON ai_chat_sessions(dataset_id);
CREATE INDEX idx_ai_chat_sessions_updated ON ai_chat_sessions(updated_at DESC);

-- Update trigger
CREATE TRIGGER update_ai_chat_sessions_updated_at
BEFORE UPDATE ON ai_chat_sessions
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- AI CHAT MESSAGES
-- ============================================
CREATE TABLE ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,

  -- Tool call metadata (for assistant messages that invoke tools)
  tool_calls JSONB,
  -- Structure: [{ "toolName": "generateChart", "args": {...}, "result": {...} }]

  -- Chart configuration (if message resulted in a chart update)
  chart_config JSONB,
  -- Structure matches existing ChartConfig type

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ai_chat_messages_session ON ai_chat_messages(session_id);
CREATE INDEX idx_ai_chat_messages_created ON ai_chat_messages(session_id, created_at);

-- ============================================
-- DATASET EMBEDDINGS (RAG)
-- ============================================
CREATE TABLE dataset_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,

  -- Content metadata
  content_type TEXT NOT NULL CHECK (content_type IN ('schema', 'sample', 'description', 'statistics')),
  content TEXT NOT NULL, -- Original text that was embedded

  -- Vector embedding (OpenAI text-embedding-3-small = 1536 dimensions)
  embedding VECTOR(1536) NOT NULL,

  -- Additional metadata
  metadata JSONB,
  -- For 'schema': { "columns": ["col1", "col2"], "types": {...} }
  -- For 'sample': { "row_count": 100, "columns": [...] }
  -- For 'statistics': { "column": "sales", "min": 0, "max": 1000, "avg": 500 }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_dataset_embeddings_dataset ON dataset_embeddings(dataset_id);
CREATE INDEX idx_dataset_embeddings_type ON dataset_embeddings(dataset_id, content_type);

-- IVFFlat index for fast similarity search (tune lists based on data size)
CREATE INDEX idx_dataset_embeddings_vector
ON dataset_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================
-- RAG SIMILARITY SEARCH FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION match_dataset_embeddings(
  p_dataset_id UUID,
  p_query_embedding VECTOR(1536),
  p_match_threshold FLOAT DEFAULT 0.5,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  content TEXT,
  content_type TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.content,
    de.content_type,
    de.metadata,
    (1 - (de.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM dataset_embeddings de
  WHERE de.dataset_id = p_dataset_id
    AND (1 - (de.embedding <=> p_query_embedding)) > p_match_threshold
  ORDER BY de.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;


