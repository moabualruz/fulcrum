import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_doc_embedding.sql",
  sql: "-- Add embedding column to documents for gated vector storage.\n-- Uses real[] for PGlite compatibility (pgvector not available in PGlite).\n-- Pillar 11 hybrid search will query this column for cosine similarity.\n\nALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding real[];\n",
};
