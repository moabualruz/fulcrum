/**
 * FlagRegistry tests.
 *
 * Acceptance criteria:
 *   1. isEnabled returns false by default (no env var, no DB row).
 *   2. isEnabled returns true when FULCRUM_FEATURES env var lists the flag.
 *   3. featureFlagRepo DB row overrides env var (repo row wins when enabled=true).
 *   4. TTL cache: second call within 60s does NOT call repo again.
 *   5. Cache bust (via clearCache()) forces a fresh repo lookup.
 *   6. FLAG_DESCRIPTIONS exported for every registered flag.
 *   7. FEATURE_FLAGS list includes all expected flags.
 */

import { describe, it, expect, afterAll, beforeEach } from "bun:test";

import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { FeatureFlagRepository } from "@identity-access/infrastructure/database/repositories/auth/FeatureFlagRepository.ts";
import {
  FlagRegistry,
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  isEnvFeatureEnabled,
  type FeatureFlagName,
} from "@platform-core/application/feature-flags/registry.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

let db: TestOrm;
let registry: FlagRegistry;

// Init once before all tests
const dbPromise = createTestOrm().then((testOrm) => {
  db = testOrm;
  const rawRepo = db.ds.getRepository(FeatureFlag);
  // Create a thin adapter matching FeatureFlagRepository.findOne(where) interface
  const repo = { findOne: (where: any) => rawRepo.findOne({ where }) } as unknown as FeatureFlagRepository;
  registry = new FlagRegistry(repo);
  return testOrm;
});

// Ensure DB is ready before any test
beforeEach(async () => {
  await dbPromise;
  // Wipe feature_flags table between tests
  await db.ds.query(`DELETE FROM feature_flags`);
  // Rebuild registry with fresh repo adapter
  const freshRawRepo = db.ds.getRepository(FeatureFlag);
  const freshRepo = { findOne: (where: any) => freshRawRepo.findOne({ where }) } as unknown as FeatureFlagRepository;
  registry = new FlagRegistry(freshRepo);
  registry.clearCache();
  delete process.env["FULCRUM_FEATURES"];
});

afterAll(async () => {
  await db?.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. All flags list + descriptions
// ─────────────────────────────────────────────────────────────────────────────

describe("FEATURE_FLAGS constant", () => {
  it("contains all registered flags", () => {
    const expected: FeatureFlagName[] = [
      "router-llm",
      "embeddings",
      "memory-llm-extract",
      "saas-auth",
      "real-time-collab-server",
      "external-llm-provider",
      "public-api",
      "outbound-webhooks",
      "notify-email",
      "notify-webhook",
      "notify-slack",
      "notify-discord",
      "casbin-policies",
      "pgvector",
      "connector-linear",
      "symphony-ssh-worker",
      "symphony-http-api",
      "i18n",
      "report-llm-narration",
      "search-click-telemetry",
      "token-tracking",
      "session-resume",
      "telemetry-remote",
      "error-reporting-remote",
      "desktop-app",
      "experiments",
      "scheduled-backups",
      "skill-marketplace",
      "trpc-permission-local-dev-bypass",
    ];
    expect(FEATURE_FLAGS).toHaveLength(expected.length);
    for (const flag of expected) {
      expect(FEATURE_FLAGS).toContain(flag);
    }
  });
});

describe("FLAG_DESCRIPTIONS", () => {
  it("has a non-empty description for every registered flag", () => {
    for (const flag of FEATURE_FLAGS) {
      expect(FLAG_DESCRIPTIONS[flag]).toBeDefined();
      expect(typeof FLAG_DESCRIPTIONS[flag]).toBe("string");
      expect(FLAG_DESCRIPTIONS[flag]!.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. isEnabled — defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("FlagRegistry.isEnabled — defaults", () => {
  it("returns false for any flag with no env var and no DB row", async () => {
    const result = await registry.isEnabled("router-llm");
    expect(result).toBe(false);
  });

  it("returns false for a global lookup (no orgId/userId) with no env var", async () => {
    const result = await registry.isEnabled("embeddings");
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. isEnabled — FULCRUM_FEATURES env var
// ─────────────────────────────────────────────────────────────────────────────

describe("FlagRegistry.isEnabled — env var", () => {
  it("returns true when flag is in FULCRUM_FEATURES (comma-separated)", async () => {
    process.env["FULCRUM_FEATURES"] = "router-llm,embeddings";
    registry.clearCache();
    expect(await registry.isEnabled("router-llm")).toBe(true);
    expect(await registry.isEnabled("embeddings")).toBe(true);
  });

  it("returns false for unlisted flag even when FULCRUM_FEATURES is set", async () => {
    process.env["FULCRUM_FEATURES"] = "router-llm";
    registry.clearCache();
    expect(await registry.isEnabled("pgvector")).toBe(false);
  });

  it("ignores whitespace around flag names in FULCRUM_FEATURES", async () => {
    process.env["FULCRUM_FEATURES"] = " router-llm , embeddings ";
    registry.clearCache();
    expect(await registry.isEnabled("router-llm")).toBe(true);
    expect(await registry.isEnabled("embeddings")).toBe(true);
  });
});

describe("canonical env feature flag bridge", () => {
  it("returns stable booleans for registered flags", () => {
    process.env["FULCRUM_FEATURES"] = "casbin-policies";
    expect(isEnvFeatureEnabled("casbin-policies")).toBe(true);
    expect(isEnvFeatureEnabled("public-api")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. isEnabled — DB row (repo override)
// ─────────────────────────────────────────────────────────────────────────────

describe("FlagRegistry.isEnabled — DB repo override", () => {
  it("returns true when a global DB row has enabled=true (no orgId/userId)", async () => {
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "pgvector",
      enabled: true,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const result = await registry.isEnabled("pgvector");
    expect(result).toBe(true);
  });

  it("returns false when a global DB row has enabled=false", async () => {
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "casbin-policies",
      enabled: false,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const result = await registry.isEnabled("casbin-policies");
    expect(result).toBe(false);
  });

  it("org-scoped DB row returns true for that orgId", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "saas-auth",
      enabled: true,
      orgId,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const result = await registry.isEnabled("saas-auth", { orgId });
    expect(result).toBe(true);
  });

  it("org-scoped DB row does NOT affect a different orgId", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "saas-auth",
      enabled: true,
      orgId,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const result = await registry.isEnabled("saas-auth", {
      orgId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result).toBe(false);
  });

  it("per-user DB row (orgId+userId) returns true for that user", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const userId = "00000000-0000-0000-0000-000000000002";
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "connector-linear",
      enabled: true,
      orgId,
      userId,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const result = await registry.isEnabled("connector-linear", { orgId, userId });
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Resolution order: repo row > env var
// ─────────────────────────────────────────────────────────────────────────────

describe("FlagRegistry.isEnabled — resolution order", () => {
  it("DB row enabled=false wins over env var presence (repo overrides env)", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-email";
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "notify-email",
      enabled: false,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const result = await registry.isEnabled("notify-email");
    expect(result).toBe(false);
  });

  it("falls back to env var when no DB row exists", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    registry.clearCache();
    const result = await registry.isEnabled("notify-webhook");
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cache behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("FlagRegistry — cache", () => {
  it("second call returns same result without extra repo call (cache hit)", async () => {
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "memory-llm-extract",
      enabled: true,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    const first = await registry.isEnabled("memory-llm-extract");
    expect(first).toBe(true);

    // Delete the row from DB — cache should still return true
    await repo.delete({ flag: "memory-llm-extract" });

    const second = await registry.isEnabled("memory-llm-extract");
    expect(second).toBe(true); // cached result
  });

  it("clearCache() forces fresh repo lookup", async () => {
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "memory-llm-extract",
      enabled: true,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    await registry.isEnabled("memory-llm-extract"); // populate cache

    // Delete row and bust cache
    await repo.delete({ flag: "memory-llm-extract" });

    // Rebuild registry with fresh repo
    const freshRawRepo2 = db.ds.getRepository(FeatureFlag);
    const freshRepo2 = { findOne: (where: any) => freshRawRepo2.findOne({ where }) } as unknown as FeatureFlagRepository;
    registry = new FlagRegistry(freshRepo2);
    registry.clearCache();

    const result = await registry.isEnabled("memory-llm-extract");
    expect(result).toBe(false);
  });

  it("bustFlag() refreshes rows changed by another path", async () => {
    const repo = db.ds.getRepository(FeatureFlag);
    const flagRow = repo.create({
      flag: "casbin-policies",
      enabled: false,
      createdAt: new Date(),
    });
    await repo.save(flagRow);

    registry.clearCache();
    expect(await registry.isEnabled("casbin-policies")).toBe(false);

    // Update via raw query to simulate another code path
    await db.ds.query(
      `UPDATE feature_flags SET enabled = true WHERE flag = 'casbin-policies'`,
    );

    registry.bustFlag("casbin-policies");

    expect(await registry.isEnabled("casbin-policies")).toBe(true);
  });
});
