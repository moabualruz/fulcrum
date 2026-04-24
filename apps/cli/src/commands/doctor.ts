import { buildSetupDoctorReport, type SetupRepositoryPort } from "@fulcrum/core";
import type { CapabilityHealthRecord, SetupState } from "@fulcrum/shared";

export function doctorCommand(input: {
  setupRepository: SetupRepositoryPort;
  noNetwork: boolean;
  setupState?: SetupState;
  extraCapabilities?: CapabilityHealthRecord[];
}) {
  return {
    schemaVersion: "1.0",
    status: "ok",
    data: buildSetupDoctorReport({
      setupState: input.setupState ?? input.setupRepository.getLatest(),
      noNetwork: input.noNetwork,
      extraCapabilities: input.extraCapabilities
    }),
    redactionStatus: "not_applicable"
  };
}
