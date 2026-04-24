import { buildSetupDoctorReport, type DoctorMode, type SetupRepositoryPort } from "@fulcrum/core";
import type { CapabilityHealthRecord, SetupState } from "@fulcrum/shared";

export function doctorCommand(input: {
  setupRepository: SetupRepositoryPort;
  noNetwork: boolean;
  mode?: DoctorMode;
  projectPath?: string;
  env?: NodeJS.ProcessEnv;
  setupState?: SetupState;
  extraCapabilities?: CapabilityHealthRecord[];
}) {
  return {
    schemaVersion: "1.0",
    status: "ok",
    data: buildSetupDoctorReport({
      setupState: input.setupState ?? input.setupRepository.getLatest(),
      noNetwork: input.noNetwork,
      mode: input.mode,
      projectPath: input.projectPath,
      env: input.env,
      extraCapabilities: input.extraCapabilities
    }),
    redactionStatus: "not_applicable"
  };
}
