import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveSetupPaths, type SetupApplyPorts, type SetupRepositoryPort } from "@fulcrum/core";
import { SetupStateSchema, type SetupState } from "@fulcrum/shared";

export class FileSetupRepository implements SetupRepositoryPort {
  constructor(
    private readonly stateFile = path.join(resolveSetupPaths().stateRoot, "setup-state.json")
  ) {}

  save(state: SetupState): SetupState {
    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    return state;
  }

  getLatest(): SetupState | undefined {
    return undefined;
  }

  async latest(): Promise<SetupState | undefined> {
    try {
      return SetupStateSchema.parse(JSON.parse(await readFile(this.stateFile, "utf8")));
    } catch {
      return undefined;
    }
  }
}

export function createServerSetupPorts(repository = new FileSetupRepository()): SetupApplyPorts {
  return {
    setupRepository: repository,
    initializeDatabase: async (dbPath) => {
      await mkdir(path.dirname(dbPath), { recursive: true });
      await writeFile(
        `${dbPath}.pending`,
        "SQLite migration pending native driver availability.\n"
      );
    }
  };
}
