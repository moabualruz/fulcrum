import { mkdir, readFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, openDatabase } from "@fulcrum/db";
import {
  clearSqliteRuntimeRecovery,
  resolveSetupPaths,
  type SetupApplyPorts,
  type SetupRepositoryPort
} from "@fulcrum/core";
import { SetupStateSchema, type SetupState } from "@fulcrum/shared";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsPath = path.join(repoRoot, "packages/db/migrations");

class FileSetupRepository implements SetupRepositoryPort {
  constructor(private readonly stateFile: string) {}

  async read(): Promise<SetupState | undefined> {
    try {
      return SetupStateSchema.parse(JSON.parse(await readFile(this.stateFile, "utf8")));
    } catch {
      return undefined;
    }
  }

  save(state: SetupState): SetupState {
    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    return state;
  }

  getLatest(): SetupState | undefined {
    return undefined;
  }
}

export async function createCliSetupPorts(
  stateRoot?: string
): Promise<SetupApplyPorts & { latest: () => Promise<SetupState | undefined> }> {
  const paths = resolveSetupPaths(stateRoot);
  const repository = new FileSetupRepository(path.join(paths.stateRoot, "setup-state.json"));
  return {
    setupRepository: repository,
    latest: () => repository.read(),
    initializeDatabase: async (dbPath) => {
      await mkdir(path.dirname(dbPath), { recursive: true });
      clearSqliteRuntimeRecovery(dbPath);
      const db = openDatabase(dbPath);
      migrate(db, migrationsPath);
      db.close();
    }
  };
}
