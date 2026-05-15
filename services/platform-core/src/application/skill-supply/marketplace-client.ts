/**
 * Skill marketplace client — fetch listings, verify Ed25519 signatures.
 * All functions gated behind FULCRUM_FEATURES=skill-marketplace.
 */

import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";

// ── Types ──────────────────────────────────────────────────────────────

export interface MarketplaceListing {
  id: string;
  slug: string;
  version: string;
  publisher_org_id: string;
  manifest_json: Record<string, unknown>;
  signature: string; // base64url-encoded Ed25519 signature
  published_at: string;
}

// ── Errors ─────────────────────────────────────────────────────────────

export class FeatureDisabledError extends Error {
  constructor(feature: string) {
    super(`Feature "${feature}" is disabled. Set FULCRUM_FEATURES=${feature} to enable.`);
    this.name = "FeatureDisabledError";
  }
}

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureVerificationError";
  }
}

// ── Feature guard ──────────────────────────────────────────────────────

export function isMarketplaceEnabled(): boolean {
  const features = process.env.FULCRUM_FEATURES ?? "";
  return features.split(",").map((f) => f.trim()).includes("skill-marketplace");
}

function assertMarketplaceEnabled(): void {
  if (!isMarketplaceEnabled()) {
    throw new FeatureDisabledError("skill-marketplace");
  }
}

// ── Signature helpers (Ed25519 via WebCrypto) ──────────────────────────

/**
 * Build the canonical message that was signed:
 * concatenation of `manifest_json` (JSON-serialized, stable) + slug + version.
 */
export function buildSignedPayload(listing: MarketplaceListing): Uint8Array<ArrayBuffer> {
  const text =
    JSON.stringify(listing.manifest_json) + listing.slug + listing.version;
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

function base64urlToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  // Pad and convert base64url → base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importEd25519PublicKey(
  base64urlKey: string,
): Promise<CryptoKey> {
  const raw = base64urlToUint8Array(base64urlKey);
  return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, [
    "verify",
  ]);
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Fetch a marketplace listing by slug (optionally pinned to a version).
 * Returns the latest version when `version` is omitted.
 */
export async function fetchListing(
  db: SqlExecutor,
  slug: string,
  version?: string,
): Promise<MarketplaceListing> {
  assertMarketplaceEnabled();

  const sql = version
    ? `SELECT id, slug, version, publisher_org_id, manifest_json, signature, published_at::text
       FROM marketplace_listings WHERE slug = $1 AND version = $2 LIMIT 1`
    : `SELECT id, slug, version, publisher_org_id, manifest_json, signature, published_at::text
       FROM marketplace_listings WHERE slug = $1
       ORDER BY published_at DESC LIMIT 1`;

  const params = version ? [slug, version] : [slug];
  const rows = await db.query<MarketplaceListing>(sql, params);
  if (rows.length === 0) {
    throw new Error(`Listing not found: ${slug}${version ? `@${version}` : ""}`);
  }
  return rows[0]!;
}

/**
 * Verify the Ed25519 signature on a listing against the publisher org's
 * public key stored in `org_marketplace_keys`.
 *
 * - Missing key → throws `SignatureVerificationError`
 * - Revoked key (`revoked_at` non-null) → treated as missing
 * - Valid sig → `true`
 * - Bad sig → `false` (+ logged error)
 */
export async function verifySignature(
  db: SqlExecutor,
  listing: MarketplaceListing,
  publisherOrgId: string,
): Promise<boolean> {
  assertMarketplaceEnabled();

  const keyRows = await db.query<{ public_key: string }>(
    `SELECT public_key FROM org_marketplace_keys
     WHERE org_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [publisherOrgId],
  );

  if (keyRows.length === 0) {
    throw new SignatureVerificationError(
      `No active public key found for org "${publisherOrgId}"`,
    );
  }

  const pubKeyB64url = keyRows[0]!.public_key;
  const pubKey = await importEd25519PublicKey(pubKeyB64url);
  const payload = buildSignedPayload(listing);
  const sigBytes = base64urlToUint8Array(listing.signature);

  const valid = await crypto.subtle.verify("Ed25519", pubKey, sigBytes, payload);

  if (!valid) {
    console.error(
      `[marketplace] signature verification failed for listing ${listing.slug}@${listing.version}`,
    );
  }

  return valid;
}
