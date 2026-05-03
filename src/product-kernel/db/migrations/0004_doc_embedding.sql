-- Add embedding column to documents for gated vector storage.
-- Uses real[] for PGlite compatibility (pgvector not available in PGlite).
-- Pillar 11 hybrid search will query this column for cosine similarity.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding real[];
