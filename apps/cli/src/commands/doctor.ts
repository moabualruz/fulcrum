import { buildSetupDoctorReport, type SetupRepositoryPort } from "@fulcrum/core";
import type { SetupState } from "@fulcrum/shared";

export function doctorCommand(input: {
  setupRepository: SetupRepositoryPort;
  noNetwork: boolean;
  setupState?: SetupState;
}) {
  return {
    schemaVersion: "1.0",
    status: "ok",
    data: buildSetupDoctorReport({
      setupState: input.setupState ?? input.setupRepository.getLatest(),
      noNetwork: input.noNetwork
    }),
    redactionStatus: "not_applicable"
  };
}
