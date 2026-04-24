import { applySetup, buildSetupPreview, type SetupApplyPorts } from "@fulcrum/core";

export function setupPreviewCommand(stateRoot?: string) {
  return {
    schemaVersion: "1.0",
    status: "ok",
    data: buildSetupPreview(stateRoot),
    redactionStatus: "not_applicable"
  };
}

export async function setupApplyCommand(ports: SetupApplyPorts, stateRoot?: string) {
  return {
    schemaVersion: "1.0",
    status: "ok",
    data: await applySetup(ports, stateRoot),
    redactionStatus: "not_applicable"
  };
}
