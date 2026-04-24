import { describe, expect, it } from "vitest";
import { buildSetupDoctorReport, buildSetupPreview, previewToSetupState } from "@fulcrum/core";

describe("doctor capability matrix contract", () => {
  it("reports required SRS matrix capabilities with privacy, freshness, and next action", () => {
    const setupState = previewToSetupState(buildSetupPreview("/tmp/fulcrum-doctor-contract"), "applied");
    const report = buildSetupDoctorReport({
      setupState,
      noNetwork: true,
      mode: "deep",
      env: { PATH: "" }
    });

    const ids = report.capabilities.map((capability) => capability.capabilityId);
    expect(ids).toEqual(
      expect.arrayContaining([
        "cap_node_runtime",
        "cap_sqlite",
        "cap_event_log",
        "cap_git",
        "cap_git_worktree",
        "cap_rg",
        "cap_fd",
        "cap_ast_grep",
        "cap_aider",
        "cap_repomix",
        "cap_memsearch",
        "cap_engram",
        "cap_quality_gates",
        "cap_redaction_config",
        "cap_network",
        "cap_plane",
        "cap_observability",
        "cap_remote_providers"
      ])
    );
    for (const capability of report.capabilities) {
      expect(capability.freshness).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(capability.nextAction?.length).toBeGreaterThan(0);
      expect(["local_only", "local_first", "operator_configured"]).toContain(
        capability.privacyStatus
      );
    }
  });
});
