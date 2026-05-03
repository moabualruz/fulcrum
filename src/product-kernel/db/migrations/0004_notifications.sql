-- User notifications table for in-app notification fan-out.
-- One row per (user, event, rule) match. Bell badge = COUNT(*) WHERE read_at IS NULL.

CREATE TABLE IF NOT EXISTS user_notifications (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES orgs(id),
  user_id text NOT NULL,
  event_id text NOT NULL REFERENCES events(id),
  rule_id text,
  entity_kind text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  verb text NOT NULL,
  actor text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_inbox_idx
  ON user_notifications (org_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_unread_idx
  ON user_notifications (user_id, read_at)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS user_notifications_entity_idx
  ON user_notifications (entity_kind, entity_id);
