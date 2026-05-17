import type { ProductStoreMigration } from "./types.ts";

export const migration: ProductStoreMigration = {
  name: "0004_marketplace.sql",
  sql: "-- Marketplace listings and publisher org keys for skill marketplace.\n\nCREATE TABLE IF NOT EXISTS marketplace_listings (\n  id text PRIMARY KEY,\n  slug text NOT NULL,\n  version text NOT NULL,\n  publisher_org_id text NOT NULL,\n  manifest_json jsonb NOT NULL,\n  signature text NOT NULL,\n  published_at timestamptz NOT NULL DEFAULT now(),\n  UNIQUE (slug, version)\n);\n\nCREATE INDEX IF NOT EXISTS marketplace_listings_publisher_idx\n  ON marketplace_listings (publisher_org_id);\n\nCREATE TABLE IF NOT EXISTS org_marketplace_keys (\n  org_id text NOT NULL,\n  public_key text NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now(),\n  revoked_at timestamptz,\n  PRIMARY KEY (org_id, public_key)\n);\n",
};
