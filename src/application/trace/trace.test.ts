import { describe, expect, test } from "bun:test";

import { traceSpineSchema, traceRefSchema } from "./schemas.ts";

describe("Phase 09.6 trace/link schemas", () => {
  test("rejects orphan work item references without project scope", () => {
    expect(() =>
      traceSpineSchema.parse({
        workspace: { kind: "workspace", id: "workspace-1" },
        workItem: { kind: "work_item", id: "task-1" },
      })
    ).toThrow(/project/i);
  });

  test("rejects run references without task or context bundle linkage", () => {
    expect(() =>
      traceSpineSchema.parse({
        workspace: { kind: "workspace", id: "workspace-1" },
        project: { kind: "project", id: "project-1" },
        run: { kind: "run", id: "run-1" },
      })
    ).toThrow(/contextBundle|workItem/i);
  });

  test("accepts full Agent OS trace spine", () => {
    expect(traceSpineSchema.parse({
      workspace: { kind: "workspace", id: "workspace-1" },
      project: { kind: "project", id: "project-1" },
      repo: { kind: "repo", id: "repo-1" },
      workItem: { kind: "work_item", id: "task-1" },
      doc: { kind: "doc", id: "doc-1" },
      contextBundle: { kind: "context_bundle", id: "context-1" },
      routingDecision: { kind: "routing_decision", id: "route-1" },
      run: { kind: "run", id: "run-1" },
      liveSession: { kind: "live_session", id: "session-1" },
      artifact: { kind: "artifact", id: "artifact-1" },
      memory: { kind: "memory", id: "memory-1" },
      audit: { kind: "audit", id: "audit-1" },
    }).run?.id).toBe("run-1");
  });

  test("entity refs are typed and non-empty", () => {
    expect(() => traceRefSchema.parse({ kind: "project", id: "" })).toThrow();
  });
});
