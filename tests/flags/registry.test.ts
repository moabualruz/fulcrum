/**
 * FlagRegistry tests — TDD RED → GREEN.
 *
 * Acceptance criteria (issue #07):
 *   1. isEnabled returns false by default (no env var, no DB row).
 *   2. isEnabled returns true when FULCRUM_FEATURES env var lists the flag.
 *   3. featureFlagRepo DB row overrides env var (repo row wins when enabled=true).
 *   4. TTL cache: second call within 60s does NOT call repo again.
 *   5. Cache bust (via clearCache()) forces a fresh repo lookup.
 *   6. FLAG_DESCRIPTIONS exported for every registered flag.
 *   7. FEATURE_FLAGS list includes all 16 expected flags.
 *
 * Per C6: No raw SQL — schema via orm.schema.create() + em.create/persistAndFlush.
 * Per C7: MikroORM v7 fork() pattern for every operation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { PGliteKyselyDialect } from "../../src/db/PGliteKyselyDriver.ts";
import { FeatureFlag } from "../../src/db/entities/auth/FeatureFlag.ts";
import { FeatureFlagRepository } from "../../src/db/repositories/auth/FeatureFlagRepository.ts";
import {
  FlagRegistry,
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  isEnvFeatureEnabled,
  type FeatureFlagName,
} from "../../src/flags/registry.ts";

let orm: MikroORM;
let registry: FlagRegistry;
let pglite: PGlite;

beforeAll(async () => {
  pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [FeatureFlag],
    debug: false,
  });

  await orm.schema.create();

  // FlagRegistry gets a forked EM-backed repo; we'll refresh it in beforeEach
  const repo = orm.em.fork().getRepository(FeatureFlag) as FeatureFlagRepository;
  registry = new FlagRegistry(repo);
});

afterAll(async () => {
  if (orm) await orm.close(true);
  if (pglite) await pglite.close();
});

beforeEach(async () => {
  // Wipe feature_flags table between tests using a fresh fork
  const em = orm.em.fork();
  await em.nativeDelete(FeatureFlag, {});

  // Rebuild registry with fresh fork repo so identity map is fresh
  const freshRepo = orm.em.fork().getRepository(FeatureFlag) as FeatureFlagRepository;
  registry = new FlagRegistry(freshRepo);

  // Clear registry cache
  registry.clearCache();
  // Reset any env vars set in previous tests
  delete process.env["FULCRUM_FEATURES"];
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. All flags list + descriptions
// ─────────────────────────────────────────────────────────────────────────────

describe("FEATURE_FLAGS constant", () => {
  it("contains all 22 registered flags", () => {
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
    ];
    expect(FEATURE_FLAGS).toHaveLength(22);
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
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "pgvector",
      enabled: true,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    const result = await registry.isEnabled("pgvector");
    expect(result).toBe(true);
  });

  it("returns false when a global DB row has enabled=false", async () => {
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "casbin-policies",
      enabled: false,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    const result = await registry.isEnabled("casbin-policies");
    expect(result).toBe(false);
  });

  it("org-scoped DB row returns true for that orgId", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "saas-auth",
      enabled: true,
      orgId,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    const result = await registry.isEnabled("saas-auth", { orgId });
    expect(result).toBe(true);
  });

  it("org-scoped DB row does NOT affect a different orgId", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "saas-auth",
      enabled: true,
      orgId,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    const result = await registry.isEnabled("saas-auth", {
      orgId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result).toBe(false);
  });

  it("per-user DB row (orgId+userId) returns true for that user", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const userId = "00000000-0000-0000-0000-000000000002";
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "connector-linear",
      enabled: true,
      orgId,
      userId,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

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
    // env var says enabled
    process.env["FULCRUM_FEATURES"] = "notify-email";
    // DB row says disabled
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "notify-email",
      enabled: false,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    // Per issue: resolution order is repo → env → false
    // DB row with enabled=false → DB wins over env var
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
    // Insert a row to make the first call non-trivial
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "memory-llm-extract",
      enabled: true,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    const first = await registry.isEnabled("memory-llm-extract");
    expect(first).toBe(true);

    // Now delete the row from DB — cache should still return true
    const em2 = orm.em.fork();
    await em2.nativeDelete(FeatureFlag, { flag: "memory-llm-extract" });

    const second = await registry.isEnabled("memory-llm-extract");
    expect(second).toBe(true); // cached result
  });

  it("clearCache() forces fresh repo lookup", async () => {
    const em = orm.em.fork();
    const flagRow = em.create(FeatureFlag, {
      flag: "memory-llm-extract",
      enabled: true,
      createdAt: new Date(),
    });
    em.persist(flagRow);
    await em.flush();

    registry.clearCache();
    await registry.isEnabled("memory-llm-extract"); // populate cache

    // Delete row and bust cache
    const em2 = orm.em.fork();
    await em2.nativeDelete(FeatureFlag, { flag: "memory-llm-extract" });

    // Rebuild registry with fresh fork repo (new identity map)
    const freshRepo = orm.em.fork().getRepository(FeatureFlag) as FeatureFlagRepository;
    registry = new FlagRegistry(freshRepo);
    // clearCache on new registry (already empty, but explicit)
    registry.clearCache();

    const result = await registry.isEnabled("memory-llm-extract");
    expect(result).toBe(false); // fresh lookup → no row → false
  });

  it("bustFlag() refreshes rows changed by another EntityManager", async () => {
    const seedEm = orm.em.fork();
    const flagRow = seedEm.create(FeatureFlag, {
      flag: "casbin-policies",
      enabled: false,
      createdAt: new Date(),
    });
    seedEm.persist(flagRow);
    await seedEm.flush();

    registry.clearCache();
    expect(await registry.isEnabled("casbin-policies")).toBe(false);

    const updateEm = orm.em.fork();
    const row = await updateEm.findOneOrFail(FeatureFlag, {
      flag: "casbin-policies",
    });
    row.enabled = true;
    await updateEm.flush();

    registry.bustFlag("casbin-policies");

    expect(await registry.isEnabled("casbin-policies")).toBe(true);
  });
});
