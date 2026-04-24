import { describe, expect, it } from "vitest";
import { MemoryService, type MemoryRepositoryPort } from "@fulcrum/core";
import type { MemoryEntry } from "@fulcrum/shared";

class MemoryRepo implements MemoryRepositoryPort {
  entries = new Map<string, MemoryEntry>();
  save(entry: MemoryEntry): MemoryEntry {
    this.entries.set(entry.memoryId, entry);
    return entry;
  }
  get(memoryId: string): MemoryEntry | undefined {
    return this.entries.get(memoryId);
  }
  list(projectId?: string): MemoryEntry[] {
    return [...this.entries.values()].filter(
      (entry) => !projectId || entry.projectId === projectId
    );
  }
}

describe("permanent memory approval", () => {
  it("keeps drafts inactive until matching policy decision is supplied", async () => {
    const service = new MemoryService(new MemoryRepo());
    const draft = service.draft({
      projectId: "proj_policy",
      title: "Approved memory",
      body: "Permanent memory needs approval.",
      sourceRefs: [{ type: "file", uri: "/tmp/source.md" }],
      requester: "test"
    });

    const blocked = service.approve(draft.entry.memoryId, { policyDecisionId: "pol_wrong" });

    expect(draft.policyDecision.status).toBe("approval_required");
    expect(blocked.entry?.status).toBe("draft");
    expect(await service.search({ projectId: "proj_policy", query: "Permanent memory" })).toHaveLength(
      0
    );
    const approved = service.approve(draft.entry.memoryId, {
      policyDecisionId: draft.policyDecision.policyDecisionId,
      requester: "test"
    });

    expect(approved.policyDecision.status).toBe("approved");
    expect(approved.entry?.status).toBe("active");
    expect(await service.search({ projectId: "proj_policy", query: "Permanent memory" })).toHaveLength(
      1
    );
  });
});
