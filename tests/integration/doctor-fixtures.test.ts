import { describe, expect, it } from "vitest";
import { buildSetupDoctorReport, buildSetupPreview, previewToSetupState } from "@fulcrum/core";

describe("doctor PATH and env fixtures", () => {
  it("classifies hidden tools and no-network remote probes with exact next actions", () => {
    const setupState = previewToSetupState(
      buildSetupPreview("/tmp/fulcrum-doctor-fixtures"),
      "applied"
    );
    const report = buildSetupDoctorReport({
      setupState,
      noNetwork: true,
      mode: "deep",
      env: { PATH: "" }
    });

    const byId = new Map(
      report.capabilities.map((capability) => [capability.capabilityId, capability])
    );
    expect(byId.get("cap_fd")).toMatchObject({
      state: "guided",
      blocking: false,
      cause: "fd is not available on PATH."
    });
    expect(byId.get("cap_git")).toMatchObject({
      state: "guided",
      blocking: false,
      cause: "git is not available on PATH."
    });
    expect(byId.get("cap_pnpm_workspace")).toMatchObject({
      state: "blocked",
      blocking: true,
      cause: "pnpm is not available on PATH."
    });
    expect(byId.get("cap_ast_grep")?.nextAction).toContain("Install ast-grep");
    expect(byId.get("cap_git_worktree")).toMatchObject({
      state: "blocked",
      blocking: true
    });
    expect(byId.get("cap_plane")).toMatchObject({
      state: "disabled",
      blocking: false,
      nextAction: "Remote check skipped."
    });
  });
});
