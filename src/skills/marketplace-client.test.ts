import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";
import {
  type MarketplaceListing,
  FeatureDisabledError,
  SignatureVerificationError,
  buildSignedPayload,
  fetchListing,
  verifySignature,
} from "./marketplace-client.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-marketplace-"));
let db: ProductDb;

// ── Ed25519 key helpers ────────────────────────────────────────────────

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateEd25519KeyPair() {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  ) as Uint8Array<ArrayBuffer>;
  return {
    privateKey: keyPair.privateKey,
    publicKeyB64url: uint8ArrayToBase64url(rawPub),
  };
}

async function signPayload(
  privateKey: CryptoKey,
  listing: MarketplaceListing,
): Promise<string> {
  const payload = buildSignedPayload(listing);
  const sig = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, payload),
  );
  return uint8ArrayToBase64url(sig);
}

// ── Lifecycle ──────────────────────────────────────────────────────────

beforeAll(async () => {
  db = await openPglite(join(scratch, "marketplace"));
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

// ── Feature flag guard ─────────────────────────────────────────────────

describe("feature flag guard", () => {
  test("fetchListing throws FeatureDisabledError when flag OFF", async () => {
    const prev = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      await expect(fetchListing(db, "test-skill")).rejects.toThrow(
        FeatureDisabledError,
      );
    } finally {
      if (prev !== undefined) process.env.FULCRUM_FEATURES = prev;
    }
  });

  test("verifySignature throws FeatureDisabledError when flag OFF", async () => {
    const prev = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      const listing: MarketplaceListing = {
        id: "l1",
        slug: "x",
        version: "1.0.0",
        publisher_org_id: "org1",
        manifest_json: {},
        signature: "AAAA",
        published_at: new Date().toISOString(),
      };
      await expect(
        verifySignature(db, listing, "org1"),
      ).rejects.toThrow(FeatureDisabledError);
    } finally {
      if (prev !== undefined) process.env.FULCRUM_FEATURES = prev;
    }
  });
});

// ── Migration idempotency ──────────────────────────────────────────────

describe("marketplace migration", () => {
  test("marketplace_listings and org_marketplace_keys tables exist", async () => {
    for (const table of ["marketplace_listings", "org_marketplace_keys"]) {
      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
        [table],
      );
      expect(rows[0]?.count ?? 0).toBe(1);
    }
  });

  test("migration is idempotent (re-run does not error)", async () => {
    const applied = await runMigrations(db);
    expect(applied).toEqual([]); // all already applied
  });

  test("unique constraint on (slug, version)", async () => {
    await db.query(
      `INSERT INTO marketplace_listings (id, slug, version, publisher_org_id, manifest_json, signature)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["dup1", "dup-skill", "1.0.0", "org1", "{}", "sig1"],
    );
    await expect(
      db.query(
        `INSERT INTO marketplace_listings (id, slug, version, publisher_org_id, manifest_json, signature)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["dup2", "dup-skill", "1.0.0", "org2", "{}", "sig2"],
      ),
    ).rejects.toThrow(); // unique violation
  });
});

// ── Signature verification ─────────────────────────────────────────────

describe("signature verification", () => {
  const ORG_ID = "org-sig-test";

  test("valid signature → true", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const { privateKey, publicKeyB64url } = await generateEd25519KeyPair();

    // Store public key
    await db.query(
      `INSERT INTO org_marketplace_keys (org_id, public_key) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, publicKeyB64url],
    );

    const listing: MarketplaceListing = {
      id: "sig1",
      slug: "my-skill",
      version: "2.0.0",
      publisher_org_id: ORG_ID,
      manifest_json: { name: "my-skill", description: "test" },
      signature: "", // placeholder, set below
      published_at: new Date().toISOString(),
    };
    listing.signature = await signPayload(privateKey, listing);

    // Insert listing
    await db.query(
      `INSERT INTO marketplace_listings (id, slug, version, publisher_org_id, manifest_json, signature)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        listing.id,
        listing.slug,
        listing.version,
        listing.publisher_org_id,
        JSON.stringify(listing.manifest_json),
        listing.signature,
      ],
    );

    const result = await verifySignature(db, listing, ORG_ID);
    expect(result).toBe(true);
  });

  test("tampered manifest → false", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const { privateKey, publicKeyB64url } = await generateEd25519KeyPair();
    const orgId = "org-tamper";

    await db.query(
      `INSERT INTO org_marketplace_keys (org_id, public_key) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [orgId, publicKeyB64url],
    );

    const listing: MarketplaceListing = {
      id: "tamper1",
      slug: "tampered",
      version: "1.0.0",
      publisher_org_id: orgId,
      manifest_json: { name: "original" },
      signature: "",
      published_at: new Date().toISOString(),
    };
    listing.signature = await signPayload(privateKey, listing);

    // Tamper with manifest after signing
    listing.manifest_json = { name: "tampered" };

    const result = await verifySignature(db, listing, orgId);
    expect(result).toBe(false);
  });

  test("missing public key → throws SignatureVerificationError", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const listing: MarketplaceListing = {
      id: "nokey1",
      slug: "no-key-skill",
      version: "1.0.0",
      publisher_org_id: "org-nonexistent",
      manifest_json: {},
      signature: "AAAA",
      published_at: new Date().toISOString(),
    };

    await expect(
      verifySignature(db, listing, "org-nonexistent"),
    ).rejects.toThrow(SignatureVerificationError);
  });

  test("revoked key treated as missing", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const { publicKeyB64url } = await generateEd25519KeyPair();
    const orgId = "org-revoked";

    await db.query(
      `INSERT INTO org_marketplace_keys (org_id, public_key, revoked_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [orgId, publicKeyB64url],
    );

    const listing: MarketplaceListing = {
      id: "rev1",
      slug: "revoked-key-skill",
      version: "1.0.0",
      publisher_org_id: orgId,
      manifest_json: {},
      signature: "AAAA",
      published_at: new Date().toISOString(),
    };

    await expect(
      verifySignature(db, listing, orgId),
    ).rejects.toThrow(SignatureVerificationError);
  });
});

// ── fetchListing ───────────────────────────────────────────────────────

describe("fetchListing", () => {
  test("fetches by slug and version", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    await db.query(
      `INSERT INTO marketplace_listings (id, slug, version, publisher_org_id, manifest_json, signature)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      ["fetch1", "fetch-skill", "3.0.0", "org1", '{"x":1}', "sig"],
    );

    const listing = await fetchListing(db, "fetch-skill", "3.0.0");
    expect(listing.slug).toBe("fetch-skill");
    expect(listing.version).toBe("3.0.0");
  });

  test("fetches latest when version omitted", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    // Insert two versions with different published_at
    await db.query(
      `INSERT INTO marketplace_listings (id, slug, version, publisher_org_id, manifest_json, signature, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      ["lat1", "latest-skill", "1.0.0", "org1", '{}', "s1", "2025-01-01T00:00:00Z"],
    );
    await db.query(
      `INSERT INTO marketplace_listings (id, slug, version, publisher_org_id, manifest_json, signature, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      ["lat2", "latest-skill", "2.0.0", "org1", '{}', "s2", "2025-06-01T00:00:00Z"],
    );

    const listing = await fetchListing(db, "latest-skill");
    expect(listing.version).toBe("2.0.0");
  });

  test("throws when listing not found", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    await expect(fetchListing(db, "nonexistent")).rejects.toThrow(
      "Listing not found",
    );
  });
});
