-- Gated embedding tables for memory and doc vector search.
-- Tables created unconditionally; rows written only when FULCRUM_FEATURES=embeddings.
-- PGlite includes pgvector; real Postgres requires CREATE EXTENSION vector.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  memory_id text NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  embedding vector(384) NOT NULL,
  model_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_id)
);

CREATE TABLE IF NOT EXISTS doc_embeddings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  embedding vector(384) NOT NULL,
  model_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_id)
);

CREATE INDEX IF NOT EXISTS memory_embeddings_hnsw
  ON memory_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS doc_embeddings_hnsw
  ON doc_embeddings USING hnsw (embedding vector_cosine_ops);

COMMENT ON TABLE memory_embeddings IS 'HNSW: USING hnsw (embedding vector_cosine_ops)';
COMMENT ON TABLE doc_embeddings IS 'HNSW: USING hnsw (embedding vector_cosine_ops)';
