import os from "node:os";
import path from "node:path";

export interface SetupPaths {
  stateRoot: string;
  configPath: string;
  dbPath: string;
  artifactRoot: string;
  logRoot: string;
  backupRoot: string;
  managedMemoryRoot: string;
}

export function resolveSetupPaths(stateRoot = process.env.FULCRUM_STATE_ROOT): SetupPaths {
  const root = stateRoot ?? path.join(os.homedir(), ".fulcrum");
  return {
    stateRoot: root,
    configPath: path.join(root, "config.toml"),
    dbPath: path.join(root, "fulcrum.sqlite"),
    artifactRoot: path.join(root, "artifacts"),
    logRoot: path.join(root, "logs"),
    backupRoot: path.join(root, "backups"),
    managedMemoryRoot: path.join(root, "memory")
  };
}
