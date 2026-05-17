import { mkdtempSync, rmSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import { FeatureDisabledError, type MarketplaceListing } from "./marketplace-client.ts";
import { productStoreMigrations } from "@platform-core/infrastructure/product-store/db/migrations/index.ts";

// Lazy-import the module under test so env can be set first
let publishSkill: typeof import("./marketplace-publisher.ts").publishSkill;
let generateKeypair: typeof import("./marketplace-publisher.ts").generateKeypair;
let VersionConflictError: typeof import("./marketplace-publisher.ts").VersionConflictError;

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-publisher-"));
let db: TestStore;

// ── Ed25519 helpers (same as client test) ─────────────────────────────

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── Lifecycle ─────────────────────────────────────────────────────────

async function runMinimalMigrations(database: TestStore): Promise<void> {
  // Run only base + marketplace migrations to avoid PGlite date-type issues in sprint migrations
  for (const name of ["0001_product_kernel.sql", "0004_marketplace.sql"]) {
    const migration = productStoreMigrations.find((candidate) => candidate.name === name);
    if (!migration) throw new Error(`Missing product-store migration ${name}`);
    await database.exec(migration.sql);
  }
}

beforeAll(async () => {
  process.env.FULCRUM_FEATURES = "skill-marketplace";
  db = await openIsolatedStore(join(scratch, "publisher"));
  await runMinimalMigrations(db);

  const mod = await import("./marketplace-publisher.ts");
  publishSkill = mod.publishSkill;
  generateKeypair = mod.generateKeypair;
  VersionConflictError = mod.VersionConflictError;
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

// ── Feature flag guard ────────────────────────────────────────────────

describe("feature flag guard", () => {
  test("publishSkill throws FeatureDisabledError when flag OFF", async () => {
    const prev = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      await expect(
        publishSkill(db, "test-skill", "1.0.0", "org1", { name: "test" }, {
          keyringDir: join(scratch, "keyring"),
          registryUrl: "http://localhost:9999",
        }),
      ).rejects.toThrow(FeatureDisabledError);
    } finally {
      if (prev !== undefined) process.env.FULCRUM_FEATURES = prev;
    }
  });

  test("generateKeypair throws FeatureDisabledError when flag OFF", async () => {
    const prev = process.env.FULCRUM_FEATURES;
    delete process.env.FULCRUM_FEATURES;
    try {
      await expect(
        generateKeypair(db, "org1", {
          keyringDir: join(scratch, "keyring"),
          confirmOverwrite: async () => false,
        }),
      ).rejects.toThrow(FeatureDisabledError);
    } finally {
      if (prev !== undefined) process.env.FULCRUM_FEATURES = prev;
    }
  });
});

// ── keygen ─────────────────────────────────────────────────────────────

describe("generateKeypair", () => {
  const keyringDir = join(scratch, "keyring-gen");

  test("generates keypair, writes private key with mode 600, inserts public key", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const orgId = "org-keygen-1";

    const result = await generateKeypair(db, orgId, {
      keyringDir,
      confirmOverwrite: async () => true,
    });

    // Private key file exists
    const keyPath = join(keyringDir, `${orgId}.key`);
    const stat = statSync(keyPath);
    // mode 600 = 0o100600 on file, check last 9 bits
    expect(stat.mode & 0o777).toBe(0o600);

    // Private key is non-empty base64url
    const privKeyContent = readFileSync(keyPath, "utf-8").trim();
    expect(privKeyContent.length).toBeGreaterThan(0);

    // Public key inserted in DB
    const rows = await db.query<{ public_key: string }>(
      `SELECT public_key FROM org_marketplace_keys WHERE org_id = $1 AND revoked_at IS NULL`,
      [orgId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]!.public_key).toBe(result.publicKeyB64url);
  });

  test("second keygen for same org with confirm=false does NOT overwrite", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const orgId = "org-keygen-nooverwrite";
    const kd = join(scratch, "keyring-nooverwrite");

    // First keygen
    await generateKeypair(db, orgId, {
      keyringDir: kd,
      confirmOverwrite: async () => true,
    });

    const keyPath = join(kd, `${orgId}.key`);
    const firstContent = readFileSync(keyPath, "utf-8");

    // Second keygen — user declines overwrite
    await expect(
      generateKeypair(db, orgId, {
        keyringDir: kd,
        confirmOverwrite: async () => false,
      }),
    ).rejects.toThrow(/overwrite/i);

    // File unchanged
    expect(readFileSync(keyPath, "utf-8")).toBe(firstContent);
  });

  test("second keygen with confirm=true overwrites and revokes old key", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const orgId = "org-keygen-overwrite";
    const kd = join(scratch, "keyring-overwrite");

    const first = await generateKeypair(db, orgId, {
      keyringDir: kd,
      confirmOverwrite: async () => true,
    });

    const second = await generateKeypair(db, orgId, {
      keyringDir: kd,
      confirmOverwrite: async () => true,
    });

    expect(second.publicKeyB64url).not.toBe(first.publicKeyB64url);

    // Old key revoked
    const revokedRows = await db.query<{ revoked_at: string | null }>(
      `SELECT revoked_at FROM org_marketplace_keys WHERE org_id = $1 AND public_key = $2`,
      [orgId, first.publicKeyB64url],
    );
    expect(revokedRows[0]?.revoked_at).not.toBeNull();

    // New key active
    const activeRows = await db.query<{ public_key: string }>(
      `SELECT public_key FROM org_marketplace_keys WHERE org_id = $1 AND revoked_at IS NULL`,
      [orgId],
    );
    expect(activeRows.length).toBe(1);
    expect(activeRows[0]!.public_key).toBe(second.publicKeyB64url);
  });
});

// ── publishSkill ──────────────────────────────────────────────────────

describe("publishSkill", () => {
  const keyringDir = join(scratch, "keyring-publish");
  let mockRegistryUrl: string;
  let postedPayloads: unknown[] = [];
  let server: ReturnType<typeof Bun.serve>;

  beforeAll(async () => {
    // Start a mock registry server
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        if (req.method === "POST" && new URL(req.url).pathname === "/api/v1/listings") {
          const body = (await req.json()) as Record<string, unknown>;

          // Simulate version conflict for slug "conflict-skill"
          if (body.slug === "conflict-skill" && body.version === "1.0.0" && postedPayloads.length > 0) {
            return new Response(JSON.stringify({ error: "version conflict" }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            });
          }

          postedPayloads.push(body);
          const listing: MarketplaceListing = {
            id: `listing-${Date.now()}`,
            slug: body.slug as string,
            version: body.version as string,
            publisher_org_id: body.publisher_org_id as string,
            manifest_json: body.manifest_json as Record<string, unknown>,
            signature: body.signature as string,
            published_at: new Date().toISOString(),
          };
          return new Response(JSON.stringify(listing), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });
    mockRegistryUrl = `http://localhost:${server.port}`;
  });

  beforeEach(() => {
    postedPayloads = [];
  });

  afterAll(() => {
    server?.stop();
  });

  test("publish signs manifest and POSTs to registry, returns listing", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const orgId = "org-publish-1";

    // Generate keypair first
    await generateKeypair(db, orgId, {
      keyringDir,
      confirmOverwrite: async () => true,
    });

    const listing = await publishSkill(db, "my-pub-skill", "1.0.0", orgId, { name: "my-pub-skill" }, {
      keyringDir,
      registryUrl: mockRegistryUrl,
    });

    expect(listing.slug).toBe("my-pub-skill");
    expect(listing.version).toBe("1.0.0");
    expect(listing.publisher_org_id).toBe(orgId);
    expect(postedPayloads.length).toBe(1);

    // Verify signature was included
    const posted = postedPayloads[0] as Record<string, unknown>;
    expect(typeof posted.signature).toBe("string");
    expect((posted.signature as string).length).toBeGreaterThan(0);
  });

  test("publish listing row has correct publisher_org_id", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const orgId = "org-publish-row";

    await generateKeypair(db, orgId, {
      keyringDir,
      confirmOverwrite: async () => true,
    });

    const listing = await publishSkill(db, "row-skill", "1.0.0", orgId, { name: "row-skill" }, {
      keyringDir,
      registryUrl: mockRegistryUrl,
    });

    expect(listing.publisher_org_id).toBe(orgId);
  });

  test("duplicate version → VersionConflictError", async () => {
    process.env.FULCRUM_FEATURES = "skill-marketplace";
    const orgId = "org-publish-conflict";

    await generateKeypair(db, orgId, {
      keyringDir,
      confirmOverwrite: async () => true,
    });

    // First publish succeeds
    await publishSkill(db, "conflict-skill", "1.0.0", orgId, { name: "conflict" }, {
      keyringDir,
      registryUrl: mockRegistryUrl,
    });

    // Second publish same version → conflict
    await expect(
      publishSkill(db, "conflict-skill", "1.0.0", orgId, { name: "conflict" }, {
        keyringDir,
        registryUrl: mockRegistryUrl,
      }),
    ).rejects.toThrow(VersionConflictError);
  });
});
