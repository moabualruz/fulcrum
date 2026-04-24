import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface LocalStateFixture {
  root: string;
  configPath: string;
  dbPath: string;
  artifactRoot: string;
  logRoot: string;
  backupRoot: string;
  managedMemoryRoot: string;
  cleanup: () => void;
}

export function createLocalStateFixture(prefix = "fulcrum-test-"): LocalStateFixture {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const artifactRoot = join(root, "artifacts");
  const logRoot = join(root, "logs");
  const backupRoot = join(root, "backups");
  const managedMemoryRoot = join(root, "memory");
  for (const directory of [artifactRoot, logRoot, backupRoot, managedMemoryRoot]) {
    mkdirSync(directory, { recursive: true });
  }
  return {
    root,
    configPath: join(root, "fulcrum.toml"),
    dbPath: join(root, "fulcrum.sqlite"),
    artifactRoot,
    logRoot,
    backupRoot,
    managedMemoryRoot,
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}
