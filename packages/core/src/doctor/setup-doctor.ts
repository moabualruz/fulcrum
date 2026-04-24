import { SCHEMA_VERSION, type CapabilityHealthRecord, type SetupState } from "@fulcrum/shared";
import { aggregateDoctorReport, type DoctorReport } from "./service.js";

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
  const capabilities: CapabilityHealthRecord[] = [
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
