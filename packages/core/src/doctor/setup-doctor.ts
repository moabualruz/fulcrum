import { SCHEMA_VERSION, type CapabilityHealthRecord, type SetupState } from "@fulcrum/shared";
import { execFileSync } from "node:child_process";
import { aggregateDoctorReport, type DoctorReport } from "./service.js";
import { sqliteStateStatus } from "../readiness/json-state-migration.js";

export interface SetupDoctorInput {
  setupState?: SetupState;
  noNetwork: boolean;
  extraCapabilities?: CapabilityHealthRecord[];
}

export function buildSetupDoctorReport(input: SetupDoctorInput): DoctorReport & {
  schemaVersion: typeof SCHEMA_VERSION;
  networkDefault: "local-only" | "operator-configured";
} {
  const now = new Date().toISOString();
  const sqlite = sqliteStateStatus(input.setupState?.dbPath);
  const capabilities: CapabilityHealthRecord[] = [
    {
      capabilityId: "cap_node_runtime",
      state: "managed",
      blocking: false,
      nextAction: `Running on Node ${process.versions.node}.`,
      privacyStatus: "local_only",
      affectedWorkflows: ["setup", "doctor", "cli", "server", "cockpit", "tui"],
      freshness: now
    },
    commandCapability({
      capabilityId: "cap_pnpm_workspace",
      command: "pnpm",
      args: ["--version"],
      affectedWorkflows: ["source_install", "cli", "server", "cockpit", "tui"],
      missingState: "blocked",
      missingAction: "Install pnpm, then run pnpm install from the repository root.",
      now
    }),
    {
      capabilityId: "cap_local_state",
      state: input.setupState?.status === "applied" ? "managed" : "guided",
      blocking: input.setupState?.status !== "applied",
      cause: input.setupState?.status === "applied" ? undefined : "Setup has not been applied.",
      nextAction:
        input.setupState?.status === "applied" ? "No action needed." : "Run fulcrum setup apply.",
      privacyStatus: input.noNetwork ? "local_only" : "local_first",
      affectedWorkflows: ["setup", "doctor"],
      freshness: now
    },
    {
      capabilityId: "cap_sqlite",
      state: input.setupState?.status === "applied" ? sqlite.state : "guided",
      blocking: input.setupState?.status === "applied" ? sqlite.blocking : true,
      cause:
        input.setupState?.status === "applied"
          ? sqlite.cause
          : "Setup has not initialized local SQLite state.",
      nextAction:
        input.setupState?.status === "applied" ? sqlite.nextAction : "Run fulcrum setup apply.",
      privacyStatus: "local_only",
      affectedWorkflows: ["setup", "doctor", "backup", "restore"],
      freshness: now
    },
    commandCapability({
      capabilityId: "cap_git",
      command: "git",
      args: ["--version"],
      affectedWorkflows: ["project", "worktree", "code"],
      missingState: "guided",
      missingAction: "Install git before project registration or worktree allocation.",
      now
    }),
    {
      capabilityId: "cap_network",
      state: input.noNetwork ? "disabled" : "optional",
      blocking: false,
      cause: input.noNetwork ? "No-network mode requested." : undefined,
      nextAction: input.noNetwork
        ? "Remote checks skipped."
        : "Enable adapters explicitly if needed.",
      privacyStatus: input.noNetwork ? "local_only" : "local_first",
      affectedWorkflows: ["adapters"],
      freshness: now
    },
    ...(input.extraCapabilities ?? [])
  ];
  return {
    ...aggregateDoctorReport(capabilities),
    schemaVersion: SCHEMA_VERSION,
    networkDefault: input.noNetwork ? "local-only" : "operator-configured"
  };
}

function commandCapability(input: {
  capabilityId: string;
  command: string;
  args: string[];
  affectedWorkflows: string[];
  missingState: CapabilityHealthRecord["state"];
  missingAction: string;
  now: string;
}): CapabilityHealthRecord {
  try {
    const version = execFileSync(input.command, input.args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return {
      capabilityId: input.capabilityId,
      state: "managed",
      blocking: false,
      nextAction: version ? `Detected ${version}.` : "Detected.",
      privacyStatus: "local_only",
      affectedWorkflows: input.affectedWorkflows,
      freshness: input.now
    };
  } catch {
    return {
      capabilityId: input.capabilityId,
      state: input.missingState,
      blocking: input.missingState === "blocked",
      cause: `${input.command} is not available on PATH.`,
      nextAction: input.missingAction,
      privacyStatus: "local_only",
      affectedWorkflows: input.affectedWorkflows,
      freshness: input.now
    };
  }
}
