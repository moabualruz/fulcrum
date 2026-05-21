import type { ProductStoreMigration } from "./types.ts";

/**
 * Brings the isolated product-store schema back in line with the canonical
 * TypeORM application migrations (`services/platform-core/.../migrations/*`).
 *
 * The isolated store kernel (`0001`) and early `0004_*` migrations drifted
 * behind production: the canonical `events`, `custom_field_defs`, `edges`,
 * `agent_profiles`, and `search_documents` tables gained columns / changed
 * column types that production query code (`work-item-service-actions.ts`,
 * `agents/queries.ts`, custom-field + edge queries, search ingestion) now
 * depends on. Web unit tests run against this isolated store, so the drift
 * surfaced as ~30 runtime SQL errors ("column does not exist", type
 * mismatch, malformed array literal).
 *
 * This migration is purely additive / type-aligning — it never drops a
 * column, so existing isolated stores keep working.
 */
export const migration: ProductStoreMigration = {
  name: "0012_isolated_store_canonical_schema_parity.sql",
  sql: [
    "-- events: canonical field-change audit columns (Platform1715788800006).",
    'ALTER TABLE events ADD COLUMN IF NOT EXISTS field_name text;',
    'ALTER TABLE events ADD COLUMN IF NOT EXISTS from_value jsonb;',
    'ALTER TABLE events ADD COLUMN IF NOT EXISTS to_value jsonb;',
    "",
    "-- custom_field_defs: canonical column set (WorkManagement1715788800001).",
    "-- The kernel/0004 store predates the slug/type/config_json/required/",
    "-- archived/position columns the work-management custom-field queries use.",
    "ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS slug text;",
    "ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS type text;",
    "ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}'::jsonb;",
    "ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false;",
    "ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;",
    "ALTER TABLE custom_field_defs ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;",
    "-- Backfill canonical columns from the legacy field_type/sort_order columns",
    "-- so any pre-existing rows stay queryable.",
    "UPDATE custom_field_defs SET type = field_type WHERE type IS NULL;",
    "UPDATE custom_field_defs SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;",
    "-- The legacy field_type column is NOT NULL; canonical inserts only write",
    "-- `type`, so relax the legacy column to keep both shapes insertable.",
    "ALTER TABLE custom_field_defs ALTER COLUMN field_type DROP NOT NULL;",
    "",
    "-- edges: canonical relationship column is `kind` (Orchestration1715788800003).",
    "-- The legacy `rel` column is NOT NULL; canonical writes only set `kind`,",
    "-- so backfill `kind` from `rel` and relax the legacy column.",
    "ALTER TABLE edges ADD COLUMN IF NOT EXISTS kind text;",
    "UPDATE edges SET kind = rel WHERE kind IS NULL;",
    "ALTER TABLE edges ALTER COLUMN rel DROP NOT NULL;",
    "",
    "-- agent_profiles: auth_env_vars is a simple-array text column in the",
    "-- canonical schema, not jsonb (Orchestration1715788800003 / AgentProfile",
    "-- entity uses TypeORM `simple-array`).",
    "ALTER TABLE agent_profiles ALTER COLUMN auth_env_vars DROP DEFAULT;",
    "ALTER TABLE agent_profiles ALTER COLUMN auth_env_vars TYPE text USING auth_env_vars::text;",
    "ALTER TABLE agent_profiles ALTER COLUMN auth_env_vars DROP NOT NULL;",
    "ALTER TABLE agent_profiles ALTER COLUMN default_flags DROP NOT NULL;",
    "ALTER TABLE agent_profiles ALTER COLUMN default_flags DROP DEFAULT;",
    "",
    "-- search_documents.labels is a plain text column in the canonical schema",
    "-- (Knowledge1715788800002); ingestion writes a comma-joined string.",
    "ALTER TABLE search_documents ALTER COLUMN labels DROP DEFAULT;",
    "ALTER TABLE search_documents ALTER COLUMN labels TYPE text USING array_to_string(labels, ',');",
    "ALTER TABLE search_documents ALTER COLUMN labels DROP NOT NULL;",
    "",
    "-- agent_runs: canonical orchestration columns (Orchestration1715788800003).",
    "-- The kernel store uses `agent`; canonical/query code reads `agent_name`",
    "-- and `claimed_by`. Add them and backfill `agent_name` from `agent`.",
    "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS agent_name text;",
    "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS claimed_by text;",
    "DO $do$ BEGIN",
    "  IF EXISTS (SELECT 1 FROM information_schema.columns",
    "             WHERE table_name = 'agent_runs' AND column_name = 'agent') THEN",
    "    UPDATE agent_runs SET agent_name = agent WHERE agent_name IS NULL;",
    "    -- canonical INSERTs only set `agent_name`; relax the legacy column.",
    "    ALTER TABLE agent_runs ALTER COLUMN agent DROP NOT NULL;",
    "  END IF;",
    "END $do$;",
    "",
    "-- workflow_defs.slug: two kernel `0004_*` migrations race to CREATE this",
    "-- table; one variant adds a NOT NULL `slug`. The canonical workflow-def",
    "-- write path (orchestration/commands.ts) never sets `slug`, so relax it",
    "-- when present (the column may not exist if the other variant won).",
    "DO $do$ BEGIN",
    "  IF EXISTS (SELECT 1 FROM information_schema.columns",
    "             WHERE table_name = 'workflow_defs' AND column_name = 'slug') THEN",
    "    ALTER TABLE workflow_defs ALTER COLUMN slug DROP NOT NULL;",
    "  END IF;",
    "END $do$;",
    "",
  ].join("\n"),
};
