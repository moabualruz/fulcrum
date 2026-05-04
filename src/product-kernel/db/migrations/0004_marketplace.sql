-- Marketplace listings and publisher org keys for skill marketplace.

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id text PRIMARY KEY,
  slug text NOT NULL,
  version text NOT NULL,
  publisher_org_id text NOT NULL,
  manifest_json jsonb NOT NULL,
  signature text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE INDEX IF NOT EXISTS marketplace_listings_publisher_idx
  ON marketplace_listings (publisher_org_id);

CREATE TABLE IF NOT EXISTS org_marketplace_keys (
  org_id text NOT NULL,
  public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (org_id, public_key)
);
