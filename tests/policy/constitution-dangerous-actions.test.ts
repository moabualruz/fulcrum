import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@fulcrum/policy";

describe("constitution dangerous actions", () => {
  it("covers destructive, remote, permanent-memory, public-bind, shell, purge, and export actions", () => {
    const actions = [
      "destructive",
      "remote_provider",
      "permanent_memory",
      "public_bind",
      "arbitrary_shell",
      "backup_purge",
      "sensitive_export"
    ] as const;

    const decisions = actions.map((action) =>
      evaluatePolicy({
        action,
        subjectType: "release-gate",
        subjectId: action,
        requester: "operator",
        localOnly: true
      })
    );

    expect(decisions).toHaveLength(actions.length);
    expect(decisions.every((decision) => decision.status !== "allowed")).toBe(true);
    expect(
      decisions.every((decision) => decision.approvalRequired || decision.status === "denied")
    ).toBe(true);
    expect(decisions.map((decision) => decision.action)).toEqual(actions);
  });
});
