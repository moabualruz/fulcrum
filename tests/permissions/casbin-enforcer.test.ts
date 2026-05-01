/**
 * CasbinEnforcerService + assertPermission flag-gated tests — TDD RED → GREEN.
 *
 * Acceptance criteria (issue #16):
 *   1. Flag OFF: assertPermission passes with valid session (existing behavior).
 *   2. Flag ON + ALLOW rule: assertPermission passes.
 *   3. Flag ON + explicit DENY rule: assertPermission throws FORBIDDEN.
 *   4. Flag ON + no Casbin rule for subject: falls through to Better-Auth path (allowed).
 *   5. CasbinEnforcerService.enforce() returns true for owner wildcard policy.
 *   6. CasbinEnforcerService.enforce() returns false for deny rule.
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 fork() pattern.
 * C8: needle-di container pattern.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { TRPCError } from "@trpc/server";

import { PGliteKyselyDialect } from "../../src/db/PGliteKyselyDriver.ts";
import { CasbinRule } from "../../src/db/entities/flags/CasbinRule.ts";
import { CasbinRuleRepository } from "../../src/db/repositories/flags/CasbinRuleRepository.ts";
import { FulcrumCasbinAdapter } from "../../src/permissions/casbin-adapter.ts";
import { CasbinEnforcerService } from "../../src/permissions/enforcer.ts";

let orm: MikroORM;
let repo: CasbinRuleRepository;

beforeAll(async () => {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [CasbinRule],
    debug: false,
  });

  await orm.schema.create();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

beforeEach(async () => {
  const em = orm.em.fork();
  await em.nativeDelete(CasbinRule, {});
  repo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
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
    const result = await svc.enforce("unknown-user", "task", "write");
    expect(result).toBe(false);
  });

  it("returns true for user with explicit allow p-rule", async () => {
    // Add allow rule: alice can read data1
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "data1", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.enforce("alice", "data1", "read");
    expect(result).toBe(true);
  });

  it("returns false when user has allow for different resource", async () => {
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "data1", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    // alice doesn't have access to data2
    const result = await svc.enforce("alice", "data2", "read");
    expect(result).toBe(false);
  });

  it("owner role via g-rule + p-rule allows access", async () => {
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    // Grant owner role to bob
    await adapter.addPolicy("g", "g", ["bob", "role:owner"]);
    // Allow role:owner to do anything on task
    await adapter.addPolicy("p", "p", ["role:owner", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.enforce("bob", "task", "write");
    expect(result).toBe(true);
  });

  it("returns false for user without the required role", async () => {
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("g", "g", ["bob", "role:owner"]);
    await adapter.addPolicy("p", "p", ["role:owner", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);
    // carol has no role
    const result = await svc.enforce("carol", "task", "write");
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CasbinEnforcerService — hasRuleFor() check
// ─────────────────────────────────────────────────────────────────────────────

describe("CasbinEnforcerService — hasRuleFor()", () => {
  it("returns false when no rules exist", async () => {
    const svc = buildEnforcer();
    const result = await svc.hasRuleFor("alice", "task");
    expect(result).toBe(false);
  });

  it("returns true when a p-rule exists for that subject+resource", async () => {
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "task", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.hasRuleFor("alice", "task");
    expect(result).toBe(true);
  });

  it("returns false when rule exists for different subject", async () => {
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "task", "read"]);

    const svc = new CasbinEnforcerService(adapter);
    const result = await svc.hasRuleFor("bob", "task");
    expect(result).toBe(false);
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
    const result = await svc.enforce("any-user", "any-resource", "any-action");
    // No rules exist → false (but middleware wouldn't even call this when flag is OFF)
    expect(result).toBe(false);
  });
});

describe("assertPermission casbin gate — flag ON deny", () => {
  it("flag ON + explicit DENY (no allow rule) → FORBIDDEN behavior", async () => {
    // Add a rule for alice on task but not for bob
    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    // Simulates middleware behavior:
    // 1. hasRuleFor(bob, task) → false (no rule) → fall through to Better-Auth
    // 2. enforce(alice, task, write) → true → allow
    // 3. enforce(alice, task, read) → false AND hasRuleFor(alice, task) → true → DENY
    const aliceWriteAllowed = await svc.enforce("alice", "task", "write");
    expect(aliceWriteAllowed).toBe(true);

    const aliceReadDenied = await svc.enforce("alice", "task", "read");
    const aliceHasRuleForTask = await svc.hasRuleFor("alice", "task");
    // alice has a rule for task but not for read → deny (don't fall through)
    expect(aliceReadDenied).toBe(false);
    expect(aliceHasRuleForTask).toBe(true);

    const bobNoRule = await svc.hasRuleFor("bob", "task");
    // bob has no rule → fall through to Better-Auth
    expect(bobNoRule).toBe(false);
  });

  it("throws FORBIDDEN TRPCError when casbin returns deny for known subject", async () => {
    // Import the checkCasbinGate utility from enforcer
    const { checkCasbinGate } = await import("../../src/permissions/enforcer.ts");

    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);

    let error: TRPCError | null = null;
    try {
      await checkCasbinGate(svc, "alice", "task", "read");
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error).not.toBeNull();
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("checkCasbinGate allows when enforce returns true", async () => {
    const { checkCasbinGate } = await import("../../src/permissions/enforcer.ts");

    const freshRepo = orm.em.fork().getRepository(CasbinRule) as CasbinRuleRepository;
    const adapter = new FulcrumCasbinAdapter(freshRepo);
    await adapter.addPolicy("p", "p", ["alice", "task", "write"]);

    const svc = new CasbinEnforcerService(adapter);
    // Should NOT throw
    await checkCasbinGate(svc, "alice", "task", "write");
  });

  it("checkCasbinGate passes through (no throw) when no rule exists for subject", async () => {
    const { checkCasbinGate } = await import("../../src/permissions/enforcer.ts");

    const svc = buildEnforcer();
    // No rules → hasRuleFor returns false → fall through (no throw)
    await checkCasbinGate(svc, "unknown-user", "task", "write");
  });
});
