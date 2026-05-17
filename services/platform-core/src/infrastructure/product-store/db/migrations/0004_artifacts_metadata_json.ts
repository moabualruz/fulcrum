import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_artifacts_metadata_json.sql",
  sql: "-- Add metadata_json column to artifacts table for extensible metadata (narration, tags, etc.)\nALTER TABLE artifacts ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;\n",
};
