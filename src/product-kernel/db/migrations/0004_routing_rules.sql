-- Routing rules for the task router (Tier 2 deterministic dispatch).
-- source: 'manual' | 'learned' | 'imported'
-- conditions_json: json-rules-engine TopLevelCondition object

CREATE TABLE IF NOT EXISTS routing_rules (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  project_id text,
  name text NOT NULL,
  conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_agent text NOT NULL,
  action_skill_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'learned', 'imported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- C2: composite indexes scoped by org_id
CREATE INDEX IF NOT EXISTS routing_rules_org_priority_idx
  ON routing_rules (org_id, priority, enabled);

CREATE INDEX IF NOT EXISTS routing_rules_org_project_idx
  ON routing_rules (org_id, project_id);
