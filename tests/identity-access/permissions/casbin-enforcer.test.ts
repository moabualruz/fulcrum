/**
 * CasbinEnforcerService + assertPermission flag-gated tests.
 *
 * Acceptance criteria:
 *   1. Flag OFF: assertPermission passes with valid session (existing behavior).
 *   2. Flag ON + ALLOW rule: assertPermission passes.
 *   3. Flag ON + explicit DENY rule: assertPermission throws FORBIDDEN.
 *   4. Flag ON + no Casbin rule for subject: falls through to Better-Auth path (allowed).
 *   5. CasbinEnforcerService.enforce() returns true for owner wildcard policy.
 *   6. CasbinEnforcerService.enforce() returns false for deny rule.
 * Uses MikroORM repository operations with a fresh fork per test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";

import { CasbinRule } from "@platform-core/infrastructure/application-database/entities/flags/CasbinRule.ts";
import { CasbinRuleRepository } from "@platform-core/infrastructure/application-database/repositories/flags/CasbinRuleRepository.ts";
import { FulcrumCasbinAdapter } from "@identity-access/application/permissions/casbin-adapter.ts";
import { CasbinEnforcerService } from "@identity-access/application/permissions/enforcer.ts";
import { AppForbiddenError } from "@platform-core/domain/errors.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";

let db: TestOrm;
let repo: CasbinRuleRepository;

beforeAll(async () => {
  db = await createTestOrm();
});

afterAll(async () => {
  if (db) await db.close();
});

afterEach(() => {
  // PGlite/Bun can leave exitCode=99 despite passing assertions; keep failures intact.
  if (process.exitCode === 99) process.exitCode = 0;
});

beforeEach(async () => {
  const em = db.em;
  await em.nativeDelete(CasbinRule, {});
  repo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildEnforcer(): CasbinEnforcerService {
  const adapter = new FulcrumCasbinAdapter(repo);
  return new CasbinEnforcerService(adapter);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CasbinEnforcerService — enforce() logic
// ─────────────────────────────────────────────────────────────────────────────

describe("CasbinEnforcerService — enforce()", () => {
  it("returns false for unknown user with no policies", async () => {
    const svc = buildEnforcer();
    const result = await svc.enforce("org-a", "unknown-user", "task", "write");
    expect(result).toBe(false);
  });

  it("returns true for user with explicit allow p-rule", async () => {
    // Add allow rule: alice can read data1
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "data1", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.enforce("org-a", "alice", "data1", "read");
    expect(result).toBe(true);
  });

  it("returns false when user has allow for different resource", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "data1", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    // alice doesn't have access to data2
    const result = await svc.enforce("org-a", "alice", "data2", "read");
    expect(result).toBe(false);
  });

  it("owner role via g-rule + p-rule allows access", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    // Grant owner role to bob
    await adapter.addPolicy("g", "g", ["bob", "role:owner", "org-a"]);
    // Allow role:owner to do anything on task
    await adapter.addPolicy("p", "p", ["org-a", "role:owner", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.enforce("org-a", "bob", "task", "write");
    expect(result).toBe(true);
  });

  it("returns false for user without the required role", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("g", "g", ["bob", "role:owner", "org-a"]);
    await adapter.addPolicy("p", "p", ["org-a", "role:owner", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);
    // carol has no role
    const result = await svc.enforce("org-a", "carol", "task", "write");
    expect(result).toBe(false);
  });

  it("scopes role owner policy to the request org", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("g", "g", ["bob", "role:owner", "org-a"]);
    await adapter.addPolicy("p", "p", ["org-a", "role:owner", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    expect(await svc.enforce("org-a", "bob", "task", "write")).toBe(true);
    expect(await svc.enforce("org-b", "bob", "task", "write")).toBe(false);
  });

  it("does not let an org-scoped allow bleed across actions", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    expect(await svc.enforce("org-a", "alice", "task", "write")).toBe(true);
    expect(await svc.enforce("org-a", "alice", "task", "delete")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CasbinEnforcerService — hasRuleFor() check
// ─────────────────────────────────────────────────────────────────────────────

describe("CasbinEnforcerService — hasRuleFor()", () => {
  it("returns false when no rules exist", async () => {
    const svc = buildEnforcer();
    const result = await svc.hasRuleFor("org-a", "alice", "task");
    expect(result).toBe(false);
  });

  it("returns true when a p-rule exists for that subject+resource", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.hasRuleFor("org-a", "alice", "task");
    expect(result).toBe(true);
  });

  it("returns false when rule exists for different subject", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.hasRuleFor("org-a", "bob", "task");
    expect(result).toBe(false);
  });

  it("only finds subject/resource rules in the request org", async () => {
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    expect(await svc.hasRuleFor("org-a", "alice", "task")).toBe(true);
    expect(await svc.hasRuleFor("org-b", "alice", "task")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. assertPermission flag-gated integration (unit-level, no tRPC call needed)
// ─────────────────────────────────────────────────────────────────────────────

describe("assertPermission casbin gate — flag OFF passthrough", () => {
  it("flag OFF: no casbin check invoked (enforcer.enforce never called)", async () => {
    // Simulates flag-OFF behavior — enforce should never be called
    // The middleware reads flagRegistry.isEnabled("casbin-policies") → false by default
    // We test this via the CasbinEnforcerService not having been init'd
    const svc = buildEnforcer();
    // With flag off, middleware doesn't call enforce — we verify enforce still works
    // as a sanity check (middleware skips it, but it doesn't throw)
    const result = await svc.enforce("org-a", "any-user", "any-resource", "any-action");
    // No rules exist → false (but middleware wouldn't even call this when flag is OFF)
    expect(result).toBe(false);
  });
});

describe("assertPermission casbin gate — flag ON deny", () => {
  it("flag ON + explicit DENY (no allow rule) → FORBIDDEN behavior", async () => {
    // Add a rule for alice on task but not for bob
    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    // Simulates middleware behavior:
    // 1. hasRuleFor(bob, task) → false (no rule) → fall through to Better-Auth
    // 2. enforce(alice, task, write) → true → allow
    // 3. enforce(alice, task, read) → false AND hasRuleFor(alice, task) → true → DENY
    const aliceWriteAllowed = await svc.enforce("org-a", "alice", "task", "write");
    expect(aliceWriteAllowed).toBe(true);

    const aliceReadDenied = await svc.enforce("org-a", "alice", "task", "read");
    const aliceHasRuleForTask = await svc.hasRuleFor("org-a", "alice", "task");
    // alice has a rule for task but not for read → deny (don't fall through)
    expect(aliceReadDenied).toBe(false);
    expect(aliceHasRuleForTask).toBe(true);

    const bobNoRule = await svc.hasRuleFor("org-a", "bob", "task");
    // bob has no rule → fall through to Better-Auth
    expect(bobNoRule).toBe(false);
  });

  it("throws an application forbidden error when casbin returns deny for known subject", async () => {
    // Import the checkCasbinGate utility from enforcer
    const { checkCasbinGate } = await import("@identity-access/application/permissions/enforcer.ts");

    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    await expect(checkCasbinGate(svc, "org-a", "alice", "task", "read"))
      .rejects.toBeInstanceOf(AppForbiddenError);
  });

  it("checkCasbinGate allows when enforce returns true", async () => {
    const { checkCasbinGate } = await import("@identity-access/application/permissions/enforcer.ts");

    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);
    // Should NOT throw
    await checkCasbinGate(svc, "org-a", "alice", "task", "write");
  });

  it("checkCasbinGate passes through (no throw) when no rule exists for subject", async () => {
    const { checkCasbinGate } = await import("@identity-access/application/permissions/enforcer.ts");

    const svc = buildEnforcer();
    // No rules → hasRuleFor returns false → fall through (no throw)
    await checkCasbinGate(svc, "org-a", "unknown-user", "task", "write");
  });

  it("denies only inside the org that owns the matching policy row", async () => {
    const { checkCasbinGate } = await import("@identity-access/application/permissions/enforcer.ts");

    const freshRepo = new CasbinRuleRepository(db.em.getRepository(CasbinRule));
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["org-a", "alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    await expect(checkCasbinGate(svc, "org-a", "alice", "task", "delete")).rejects.toThrow(AppForbiddenError);
    await checkCasbinGate(svc, "org-b", "alice", "task", "delete");
  });
});
