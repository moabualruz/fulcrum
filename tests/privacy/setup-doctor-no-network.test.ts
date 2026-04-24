import { describe, expect, it } from "vitest";
import { buildSetupDoctorReport, buildSetupPreview, previewToSetupState } from "@fulcrum/core";

describe("setup and doctor no-network behavior", () => {
  it("keeps setup local-only and disables network capability", () => {
    const state = previewToSetupState(buildSetupPreview("/tmp/fulcrum-no-network"), "applied");
    const report = buildSetupDoctorReport({ setupState: state, noNetwork: true });
    expect(report.networkDefault).toBe("local-only");
    expect(
      report.capabilities.find((capability) => capability.capabilityId === "cap_network")?.state
    ).toBe("disabled");
  });
});
