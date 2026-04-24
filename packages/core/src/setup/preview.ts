import { makeId, SCHEMA_VERSION, type SetupState } from "@fulcrum/shared";
import { resolveSetupPaths, type SetupPaths } from "./paths.js";

export interface SetupPreview {
  setupId: string;
  paths: SetupPaths;
  privacyMode: "local_only";
  networkDefault: "local-only";
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  approvalsRequired: string[];
  changes: string[];
  schemaVersion: "1.0";
}

export function buildSetupPreview(stateRoot?: string): SetupPreview {
  const paths = resolveSetupPaths(stateRoot);
  return {
    setupId: makeId("setup", paths.stateRoot),
    paths,
    privacyMode: "local_only",
    networkDefault: "local-only",
    requiredCapabilities: [
      "cap_node_runtime",
      "cap_pnpm_workspace",
      "cap_local_state",
      "cap_sqlite"
    ],
    optionalCapabilities: ["cap_git", "cap_playwright", "cap_mcp", "cap_cockpit", "cap_tui"],
    approvalsRequired: [],
    changes: [
      `create ${paths.stateRoot}`,
      `create ${paths.artifactRoot}`,
      `create ${paths.logRoot}`,
      `create ${paths.backupRoot}`,
      `create ${paths.managedMemoryRoot}`,
      `initialize ${paths.dbPath}`
    ],
    schemaVersion: SCHEMA_VERSION
  };
}

export function previewToSetupState(
  preview: SetupPreview,
  status: SetupState["status"] = "previewed"
): SetupState {
  const now = new Date().toISOString();
  return {
    setupId: preview.setupId,
    status,
    stateRoot: preview.paths.stateRoot,
    configPath: preview.paths.configPath,
    dbPath: preview.paths.dbPath,
    artifactRoot: preview.paths.artifactRoot,
    logRoot: preview.paths.logRoot,
    backupRoot: preview.paths.backupRoot,
    managedMemoryRoot: preview.paths.managedMemoryRoot,
    privacyMode: preview.privacyMode,
    networkDefault: preview.networkDefault,
    redactionProfileId: "cap_redaction_default",
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION
  };
}
