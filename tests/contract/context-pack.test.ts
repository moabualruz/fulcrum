import { describe, expect, it } from "vitest";
import { ContextItemSchema, ContextPackSchema, SCHEMA_VERSION } from "@fulcrum/shared";

describe("context pack contract", () => {
  it("requires provenance, reason, freshness, evidence type, budget, and redaction status", () => {
    const now = new Date(0).toISOString();
    const pack = ContextPackSchema.parse({
      contextPackId: "ctx_contract",
      projectId: "proj_contract",
      taskId: "task_contract",
      status: "ready",
      generatedAt: now,
      budget: 100,
      budgetUsed: 10,
      laneSummaries: [{ lane: "task", included: 1, budgetUsed: 10, budgetLimit: 25 }],
      omissions: [{ lane: "memory", reason: "Omitted by budget." }],
      degradedLanes: [{ lane: "code", cause: "Adapter unavailable.", fallback: "Path evidence." }],
      freshness: now,
      exportRefs: [{ type: "file", uri: "file:///tmp/context.md" }],
      policyDecisionIds: [],
      redactionStatus: "not_redacted",
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION
    });
    const item = ContextItemSchema.parse({
      contextItemId: "ctxi_contract_task",
      contextPackId: pack.contextPackId,
      lane: "task",
      type: "evidence",
      sourceRef: { type: "task", uri: "fulcrum://tasks/task_contract" },
      title: "Task evidence",
      excerptRef: "Implement context builder.",
      inclusionReason: "Primary task source.",
      freshness: now,
      evidenceType: "task",
      limitation: "Snapshot only.",
      budgetEstimate: 10,
      rank: 1,
      redactionStatus: "not_redacted",
      linkedRefs: [{ type: "project", uri: "fulcrum://projects/proj_contract" }],
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION
    });

    expect(pack.omissions[0]?.reason).toContain("budget");
    expect(item.sourceRef.uri).toMatch(/^fulcrum:\/\//);
    expect(item.inclusionReason).toBeTruthy();
    expect(item.freshness).toBe(now);
    expect(item.evidenceType).toBe("task");
  });
});
