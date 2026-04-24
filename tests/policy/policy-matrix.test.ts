import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@fulcrum/policy";

describe("policy matrix", () => {
  it("denies remote providers in local-only mode", () => {
    const decision = evaluatePolicy({
      action: "remote_provider",
      subjectType: "adapter",
      subjectId: "adapter_remote",
      requester: "test",
      localOnly: true,
      preview: false
    });
    expect(decision.status).toBe("denied");
  });

  it("requires approval for dangerous actions", () => {
    for (const action of [
      "destructive",
      "remote_provider",
      "remote_pm",
      "remote_model",
      "telemetry",
      "remote_observability",
      "public_bind",
      "permanent_memory",
      "arbitrary_shell",
      "backup_purge",
      "sensitive_export",
      "worktree_cleanup",
      "external_writeback",
      "memory_delete",
      "adapter_execute"
    ] as const) {
      expect(
        evaluatePolicy({
          action,
          subjectType: "test",
          subjectId: "thing",
          requester: "test",
          localOnly: false,
          preview: true
        }).status
      ).toBe("approval_required");
    }
  });
});
