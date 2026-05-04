-- Settings tables: routing rules, feature flags, custom fields, saved views, members, invitations.

CREATE TABLE IF NOT EXISTS routing_rules (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_rules_scope_idx ON routing_rules (org_id, project_id, priority);

CREATE TABLE IF NOT EXISTS feature_flags (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  name text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','select','multi_select','number','date','user','url','json')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_field_defs_scope_idx ON custom_field_defs (org_id, project_id, sort_order);

CREATE TABLE IF NOT EXISTS saved_views (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  project_id text REFERENCES projects(id),
  name text NOT NULL,
  filter_ast jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL CHECK (scope IN ('private','project','org')) DEFAULT 'private',
  is_default boolean NOT NULL DEFAULT false,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  user_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','member','viewer')) DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_email)
);

CREATE TABLE IF NOT EXISTS invitations (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','member','viewer')) DEFAULT 'member',
  status text NOT NULL CHECK (status IN ('pending','accepted','revoked')) DEFAULT 'pending',
  invited_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);
