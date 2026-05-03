-- Gated embedding tables. Schema ships unconditionally; rows written only
-- when FULCRUM_FEATURES=embeddings. Requires pgvector extension.
-- PGLITE-COMPAT: PGlite 0.4.x bundles pgvector via @electric-sql/pglite/vector;
-- if unavailable at runtime, CREATE EXTENSION is a no-op (IF NOT EXISTS).
-- Fallback to Vectra file-backed store documented in PRD §Dependency table.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id text PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  embedding vector(384),
  model_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW index for cosine similarity search (C6 carve-out).
CREATE INDEX IF NOT EXISTS memory_embeddings_hnsw
  ON memory_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS doc_embeddings (
  doc_id text PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  embedding vector(384),
  model_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_embeddings_hnsw
  ON doc_embeddings USING hnsw (embedding vector_cosine_ops);
