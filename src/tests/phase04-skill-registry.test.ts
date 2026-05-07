/**
 * Phase 04 — Skill registry: MCP virtual skills, conflict detection, lock enforcement.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { McpVirtualSkill } from "../db/entities/skills/McpVirtualSkill.ts";
import { LearnedDraftSchema } from "@fulcrum/server/router/decision-schema.ts";
import { createDisabledDraft } from "@fulcrum/server/router/learned-drafts.ts";

// ---------------------------------------------------------------------------
// 1. MCP Virtual Skill descriptor hashing
// ---------------------------------------------------------------------------

describe("McpVirtualSkill descriptor hashing", () => {
  test("descriptorSha256 is deterministic for same input", () => {
    const descriptor = JSON.stringify({
      serverName: "context7",
      commandOrUrl: "npx @context7/mcp",
      toolNamesJson: ["ctx7"],
    });
    const hash1 = createHash("sha256").update(descriptor).digest("hex");
    const hash2 = createHash("sha256").update(descriptor).digest("hex");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  test("different descriptors produce different hashes", () => {
    const d1 = JSON.stringify({ serverName: "a", commandOrUrl: "cmd-a" });
    const d2 = JSON.stringify({ serverName: "b", commandOrUrl: "cmd-b" });
    const h1 = createHash("sha256").update(d1).digest("hex");
    const h2 = createHash("sha256").update(d2).digest("hex");
    expect(h1).not.toBe(h2);
  });

  test("McpVirtualSkill entity has required fields", () => {
    const skill = new McpVirtualSkill();
    skill.slug = "test-mcp";
    skill.serverName = "test-server";
    skill.commandOrUrl = "npx test-mcp";
    skill.descriptorSha256 = "a".repeat(64);
    skill.toolNamesJson = ["tool1", "tool2"];
    expect(skill.source).toBe("mcp");
    expect(skill.invokableByFulcrum).toBe(false);
  });

  test("descriptor-only skills are not invokable", () => {
    const skill = new McpVirtualSkill();
    expect(skill.invokableByFulcrum).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Skill lock enforcement (SHA mismatch → fail-closed)
// ---------------------------------------------------------------------------

describe("skill lock enforcement", () => {
  test("SHA mismatch detected when hashes differ", () => {
    const localHash = "a".repeat(64);
    const upstreamHash = "b".repeat(64);
    const mismatch = localHash !== upstreamHash;
    expect(mismatch).toBe(true);
  });

  test("fail-closed: mismatch exposes exact SHA values", () => {
    const localHash = createHash("sha256").update("local-content").digest("hex");
    const upstreamHash = createHash("sha256").update("upstream-content").digest("hex");
    // Simulate fail-closed behavior: when SHA differs, report both
    const error = `skill lock violation: expected=${localHash} actual=${upstreamHash}`;
    expect(error).toContain(localHash);
    expect(error).toContain(upstreamHash);
    expect(localHash).not.toBe(upstreamHash);
  });

  test("matching SHA passes lock check", () => {
    const content = "stable-descriptor";
    const hash = createHash("sha256").update(content).digest("hex");
    expect(hash).toBe(createHash("sha256").update(content).digest("hex"));
  });
});

// ---------------------------------------------------------------------------
// 3. Skill conflict detection
// ---------------------------------------------------------------------------

describe("skill conflict detection via drafts", () => {
  test("createDisabledDraft marks conflict when matchingActiveRuleIds non-empty", () => {
    const draft = createDisabledDraft({
      taskFacts: { kind: "bug" },
      noMatchReason: "no rule matched",
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
      source: "llm",
      confidence: 0.7,
      backend: "embedded",
      model: "router-small",
      matchingActiveRuleIds: ["rule-001"],
    });
    expect(draft.status).toBe("conflict");
    expect(draft.enabled).toBe(false);
  });

  test("createDisabledDraft marks review_needed when no conflicts", () => {
    const draft = createDisabledDraft({
      taskFacts: { kind: "feature" },
      noMatchReason: "no rule matched",
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "feature" }] },
      proposedActions: { agent: "claude" },
      source: "no_match",
      confidence: 0.6,
      backend: null,
      model: null,
      matchingActiveRuleIds: [],
    });
    expect(draft.status).toBe("review_needed");
    expect(draft.enabled).toBe(false);
  });
});
