import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@fulcrum/policy";

describe("local-only remote policy", () => {
  it("denies all remote/network-dependent action classes", () => {
    for (const action of [
      "remote_provider",
      "remote_pm",
      "remote_model",
      "telemetry",
      "remote_observability",
      "public_bind"
    ] as const) {
      expect(
        evaluatePolicy({
          action,
          subjectType: "adapter",
          subjectId: action,
          requester: "test",
          preview: false,
          localOnly: true
        }).status
      ).toBe("denied");
    }
  });
});
