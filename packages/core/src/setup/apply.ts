import { mkdir } from "node:fs/promises";
import { type SetupState } from "@fulcrum/shared";
import { buildSetupPreview, previewToSetupState } from "./preview.js";

export interface SetupRepositoryPort {
  save(state: SetupState): SetupState;
  getLatest(): SetupState | undefined;
}

export interface SetupApplyPorts {
  setupRepository: SetupRepositoryPort;
  initializeDatabase: (dbPath: string) => Promise<void> | void;
}

export async function applySetup(ports: SetupApplyPorts, stateRoot?: string): Promise<SetupState> {
  const preview = buildSetupPreview(stateRoot);
  await Promise.all([
    mkdir(preview.paths.stateRoot, { recursive: true }),
    mkdir(preview.paths.artifactRoot, { recursive: true }),
    mkdir(preview.paths.logRoot, { recursive: true }),
    mkdir(preview.paths.backupRoot, { recursive: true }),
    mkdir(preview.paths.managedMemoryRoot, { recursive: true })
  ]);
  await ports.initializeDatabase(preview.paths.dbPath);
  return ports.setupRepository.save(previewToSetupState(preview, "applied"));
}
