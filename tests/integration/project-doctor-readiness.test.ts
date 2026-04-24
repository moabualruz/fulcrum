import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSetupDoctorReport, buildSetupPreview, previewToSetupState } from "@fulcrum/core";

describe("project doctor readiness", () => {
  it("reports project MCP and agent configuration readiness", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "fulcrum-project-doctor-"));
    mkdirSync(join(projectPath, ".codex"), { recursive: true });
    mkdirSync(join(projectPath, ".vscode"), { recursive: true });
    writeFileSync(join(projectPath, "AGENTS.md"), "# Agents\n");
    writeFileSync(join(projectPath, ".gitignore"), "node_modules/\n");
    writeFileSync(join(projectPath, ".codex", "config.toml"), 'model = "codex"\n');
    writeFileSync(join(projectPath, ".vscode", "mcp.json"), "{}\n");

    const setupState = previewToSetupState(
      buildSetupPreview("/tmp/fulcrum-project-doctor"),
      "applied"
    );
    const report = buildSetupDoctorReport({
      setupState,
      noNetwork: true,
      mode: "deep",
      projectPath,
      env: { PATH: "" }
    });

    const byId = new Map(
      report.capabilities.map((capability) => [capability.capabilityId, capability])
    );
    expect(byId.get("cap_project_agents")).toMatchObject({ state: "managed", blocking: false });
    expect(byId.get("cap_project_codex")).toMatchObject({ state: "managed", blocking: false });
    expect(byId.get("cap_project_copilot_mcp")).toMatchObject({
      state: "managed",
      blocking: false
    });
    expect(byId.get("cap_project_ignore_rules")).toMatchObject({
      state: "managed",
      blocking: false
    });
    expect(byId.get("cap_project_claude")).toMatchObject({
      state: "guided",
      blocking: false,
      cause: "Project configuration not found."
    });
  });
});
