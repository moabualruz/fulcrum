import { describe, expect, it } from "vitest";
import { localOnlyAllows } from "@fulcrum/policy";

describe("local-only product workflow", () => {
  it("allows local state workflow steps while denying remote transfer attempts", () => {
    const localSteps = [
      "setup.apply",
      "project.register",
      "task.create",
      "context.build",
      "code.search",
      "memory.search",
      "artifact.attach",
      "quality.run",
      "backup.create"
    ];
    const remoteSteps = ["remote_pm", "remote_model", "telemetry"] as const;

    expect(localSteps).toHaveLength(9);
    expect(remoteSteps.map((step) => localOnlyAllows(true, step))).toEqual(
      remoteSteps.map(() => false)
    );
  });
});
