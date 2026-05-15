/**
 * Skill marketplace publisher — sign manifests with Ed25519, POST to registry.
 * Key generation for org publisher identity.
 * All functions gated behind FULCRUM_FEATURES=skill-marketplace.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import {
  type MarketplaceListing,
  FeatureDisabledError,
  isMarketplaceEnabled,
  buildSignedPayload,
} from "./marketplace-client.ts";

// ── Errors ────────────────────────────────────────────────────────────

export class VersionConflictError extends Error {
  constructor(slug: string, version: string) {
    super(`Version conflict: ${slug}@${version} already published`);
    this.name = "VersionConflictError";
  }
}

// ── Feature guard ─────────────────────────────────────────────────────

function assertMarketplaceEnabled(): void {
  if (!isMarketplaceEnabled()) {
    throw new FeatureDisabledError("skill-marketplace");
  }
}

// ── Base64url helpers ─────────────────────────────────────────────────

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Keygen options ────────────────────────────────────────────────────

export interface KeygenOptions {
  /** Directory for private key storage. Default: ~/.fulcrum/keyring */
  keyringDir?: string;
  /** Called when key already exists for org. Return true to overwrite. */
  confirmOverwrite: () => Promise<boolean>;
}

export interface KeygenResult {
  publicKeyB64url: string;
  privateKeyPath: string;
}

// ── Publish options ───────────────────────────────────────────────────

export interface PublishOptions {
  /** Directory containing private keys. Default: ~/.fulcrum/keyring */
  keyringDir?: string;
  /** Registry base URL. Default: FULCRUM_MARKETPLACE_URL env or https://marketplace.fulcrum.dev */
  registryUrl?: string;
}

// ── Key generation ────────────────────────────────────────────────────

/**
 * Generate Ed25519 keypair for an org.
 * - Writes private key to `keyringDir/<orgId>.key` with chmod 600
 * - Inserts public key into `org_marketplace_keys`
 * - If key exists: calls `confirmOverwrite`; false → throws
 * - If overwriting: revokes old key in DB
 */
export async function generateKeypair(
  db: SqlExecutor,
  orgId: string,
  opts: KeygenOptions,
): Promise<KeygenResult> {
  assertMarketplaceEnabled();

  const keyringDir = opts.keyringDir ?? join(process.env.HOME ?? "~", ".fulcrum", "keyring");
  const keyPath = join(keyringDir, `${orgId}.key`);

  // Check for existing key
  if (existsSync(keyPath)) {
    const proceed = await opts.confirmOverwrite();
    if (!proceed) {
      throw new Error(`Aborted: will not overwrite existing key for org "${orgId}"`);
    }
  }

  // Generate Ed25519 keypair
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  const rawPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const rawPriv = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  );

  const publicKeyB64url = uint8ArrayToBase64url(rawPub);
  const privateKeyB64url = uint8ArrayToBase64url(rawPriv);

  // Revoke any existing active keys for this org
  await db.query(
    `UPDATE org_marketplace_keys SET revoked_at = now() WHERE org_id = $1 AND revoked_at IS NULL`,
    [orgId],
  );

  // Insert new public key
  await db.query(
    `INSERT INTO org_marketplace_keys (org_id, public_key) VALUES ($1, $2)`,
    [orgId, publicKeyB64url],
  );

  // Write private key file
  mkdirSync(keyringDir, { recursive: true });
  writeFileSync(keyPath, privateKeyB64url, { mode: 0o600 });
  chmodSync(keyPath, 0o600);

  return { publicKeyB64url, privateKeyPath: keyPath };
}

// ── Publish ───────────────────────────────────────────────────────────

/**
 * Sign a skill manifest and POST to the marketplace registry.
 * Returns the created MarketplaceListing from the registry response.
 * Throws VersionConflictError if (slug, version) already exists.
 */
export async function publishSkill(
  db: SqlExecutor,
  slug: string,
  version: string,
  orgId: string,
  manifestJson: Record<string, unknown>,
  opts: PublishOptions,
): Promise<MarketplaceListing> {
  assertMarketplaceEnabled();

  const keyringDir = opts.keyringDir ?? join(process.env.HOME ?? "~", ".fulcrum", "keyring");
  const keyPath = join(keyringDir, `${orgId}.key`);

  if (!existsSync(keyPath)) {
    throw new Error(
      `No private key found for org "${orgId}". Run \`fulcrum marketplace keygen\` first.`,
    );
  }

  // Load private key
  const privKeyB64url = readFileSync(keyPath, "utf-8").trim();
  const privKeyRaw = base64urlToUint8Array(privKeyB64url);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privKeyRaw,
    { name: "Ed25519" },
    false,
    ["sign"],
  );

  // Build and sign payload
  const listing: MarketplaceListing = {
    id: "", // assigned by registry
    slug,
    version,
    publisher_org_id: orgId,
    manifest_json: manifestJson,
    signature: "", // set below
    published_at: "", // assigned by registry
  };

  const payload = buildSignedPayload(listing);
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, payload),
  );
  const signature = uint8ArrayToBase64url(sigBytes);

  // POST to registry
  const registryUrl =
    opts.registryUrl ??
    process.env.FULCRUM_MARKETPLACE_URL ??
    "https://marketplace.fulcrum.dev";

  const response = await fetch(new URL("/api/v1/listings", registryUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      version,
      publisher_org_id: orgId,
      manifest_json: manifestJson,
      signature,
    }),
  });

  if (response.status === 409) {
    throw new VersionConflictError(slug, version);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Registry error (${response.status}): ${text}`);
  }

  return (await response.json()) as MarketplaceListing;
}

// Re-export for convenience
export { FeatureDisabledError } from "./marketplace-client.ts";
