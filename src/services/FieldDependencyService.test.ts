/**
 * FieldDependencyService unit tests — Phase 05 Plan 12 (D-111, HIGH-03).
 *
 * Tests server-side field dependency validation and CRUD.
 * Uses mock EntityManager; no real DB required.
 */

import { describe, it, expect, vi, beforeEach } from "bun:test";
import { FieldDependencyService } from "./FieldDependencyService.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

type RuleOverrides = {
  id?: string;
  sourceFieldId?: string;
  sourceValue?: string;
  targetFieldId?: string;
  action?: string;
  projectId?: string;
};

function makeRule(overrides: RuleOverrides = {}) {
  return {
    id: "rule-1",
    sourceFieldId: "status",
    sourceValue: "done",
    targetFieldId: "assignee",
    action: "require",
    projectId: "proj-1",
    org: { id: "org-1" },
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockEm(rules: ReturnType<typeof makeRule>[] = [makeRule()]) {
  const persist = vi.fn();
  const remove = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);
  const findOne = vi.fn();
  const find = vi.fn().mockResolvedValue(rules);
  const getReference = vi.fn((_cls: unknown, id: string) => ({ id }));
  const create = vi.fn((_cls: unknown, data: unknown) => ({ ...data as object, id: "new-rule-1", createdAt: new Date() }));

  return {
    em: { persist, remove, flush, findOne, find, getReference, create } as unknown as ConstructorParameters<typeof FieldDependencyService>[0],
    persist,
    remove,
    flush,
    findOne,
    find,
    getReference,
    create,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FieldDependencyService.validate", () => {
  it("passes when all required fields are filled", async () => {
    const { em } = makeMockEm([
      makeRule({ sourceFieldId: "status", sourceValue: "done", targetFieldId: "assignee", action: "require" }),
    ]);

    const svc = new FieldDependencyService(em);
    // should not throw
    await expect(
      svc.validate("org-1", "proj-1", { status: "done", assignee: "user-42" })
    ).resolves.toBeUndefined();
  });

  it("rejects when a required field is empty", async () => {
    const { em } = makeMockEm([
      makeRule({ sourceFieldId: "status", sourceValue: "done", targetFieldId: "assignee", action: "require" }),
    ]);

    const svc = new FieldDependencyService(em);
    await expect(
      svc.validate("org-1", "proj-1", { status: "done", assignee: "" })
    ).rejects.toThrow(/assignee/);
  });

  it("rejects when a required field is absent", async () => {
    const { em } = makeMockEm([
      makeRule({ sourceFieldId: "type", sourceValue: "bug", targetFieldId: "severity", action: "require" }),
    ]);

    const svc = new FieldDependencyService(em);
    await expect(
      svc.validate("org-1", "proj-1", { type: "bug" })
    ).rejects.toThrow(/severity/);
  });

  it("passes when source condition does not match (rule not triggered)", async () => {
    const { em } = makeMockEm([
      makeRule({ sourceFieldId: "status", sourceValue: "done", targetFieldId: "assignee", action: "require" }),
    ]);

    const svc = new FieldDependencyService(em);
    // status is "in_progress", not "done" — rule not triggered
    await expect(
      svc.validate("org-1", "proj-1", { status: "in_progress" })
    ).resolves.toBeUndefined();
  });
});

describe("FieldDependencyService.listRules", () => {
  it("returns rules for the given project scoped by orgId", async () => {
    const rule = makeRule();
    const { em, find } = makeMockEm([rule]);

    const svc = new FieldDependencyService(em);
    const result = await svc.listRules("org-1", "proj-1");
    expect(find).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("rule-1");
  });
});

describe("FieldDependencyService.createRule", () => {
  it("persists and flushes a new rule", async () => {
    const { em, persist, flush } = makeMockEm([]);

    const svc = new FieldDependencyService(em);
    await svc.createRule("org-1", {
      projectId: "proj-1",
      sourceFieldId: "type",
      sourceValue: "bug",
      targetFieldId: "severity",
      action: "require",
    });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe("FieldDependencyService.deleteRule", () => {
  it("finds and removes the rule then flushes", async () => {
    const rule = makeRule();
    const { em, findOne, remove, flush } = makeMockEm([]);
    findOne.mockResolvedValue(rule);

    const svc = new FieldDependencyService(em);
    await svc.deleteRule("org-1", "rule-1");

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(rule);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("throws when rule not found", async () => {
    const { em, findOne } = makeMockEm([]);
    findOne.mockResolvedValue(null);

    const svc = new FieldDependencyService(em);
    await expect(svc.deleteRule("org-1", "nonexistent")).rejects.toThrow(/not found/i);
  });
});
