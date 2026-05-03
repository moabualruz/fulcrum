-- Add metadata_json column to artifacts table for extensible metadata (narration, tags, etc.)
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;
