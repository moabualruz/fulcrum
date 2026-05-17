import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0002_search.sql",
  sql: "-- FTS read model populated from source rows.\n\nCREATE TABLE IF NOT EXISTS search_documents (\n  id text PRIMARY KEY,\n  org_id text NOT NULL,\n  project_id text,\n  source_kind text NOT NULL,\n  source_id text NOT NULL,\n  title text NOT NULL,\n  body text NOT NULL,\n  labels text[] NOT NULL DEFAULT '{}',\n  updated_at timestamptz NOT NULL DEFAULT now(),\n  search_vector tsvector GENERATED ALWAYS AS (\n    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||\n    setweight(to_tsvector('english', coalesce(body, '')), 'B')\n  ) STORED,\n  UNIQUE (source_kind, source_id)\n);\n\nCREATE INDEX IF NOT EXISTS search_documents_vector_idx ON search_documents USING gin (search_vector);\nCREATE INDEX IF NOT EXISTS search_documents_scope_idx ON search_documents (org_id, project_id, source_kind);\n",
};
