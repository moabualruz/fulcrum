import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  BackupManifestSchema,
  ExportRecordSchema,
  makeId,
  SCHEMA_VERSION,
  type BackupManifest,
  type ExportRecord
} from "@fulcrum/shared";

export interface BackupRepositoryPort {
  save(manifest: BackupManifest): BackupManifest;
  get(backupId: string): BackupManifest | undefined;
  list(): BackupManifest[];
}

export interface BackupCreateRequest {
  stateRoot: string;
  outputRoot: string;
  includeContextPacks?: boolean;
}

interface RecoveryStore {
  backups: BackupManifest[];
  exports: ExportRecord[];
}

const emptyStore: RecoveryStore = {
  backups: [],
  exports: []
};

export class FileBackupRepository implements BackupRepositoryPort {
  constructor(private readonly storeFile: string) {}

  save(manifest: BackupManifest): BackupManifest {
    const parsed = BackupManifestSchema.parse(manifest);
    const store = readStore(this.storeFile);
    store.backups = [parsed, ...store.backups.filter((item) => item.backupId !== parsed.backupId)];
    writeStore(this.storeFile, store);
    return parsed;
  }

  get(backupId: string): BackupManifest | undefined {
    return readStore(this.storeFile).backups.find((manifest) => manifest.backupId === backupId);
  }

  list(): BackupManifest[] {
    return readStore(this.storeFile).backups;
  }
}

export class FileExportRepository {
  constructor(private readonly storeFile: string) {}

  save(record: ExportRecord): ExportRecord {
    const parsed = ExportRecordSchema.parse(record);
    const store = readStore(this.storeFile);
    store.exports = [parsed, ...store.exports.filter((item) => item.exportId !== parsed.exportId)];
    writeStore(this.storeFile, store);
    return parsed;
  }

  list(): ExportRecord[] {
    return readStore(this.storeFile).exports;
  }
}

export class BackupManifestService {
  constructor(private readonly repository: BackupRepositoryPort) {}

  create(request: BackupCreateRequest): BackupManifest {
    const createdAt = new Date().toISOString();
    const backupId = makeId("backup", `${request.stateRoot}-${createdAt}`);
    const backupDir = join(request.outputRoot, backupId);
    mkdirSync(backupDir, { recursive: true });

    const includedRecords = countSqliteRecords(request.stateRoot);
    const coverage = collectCoverage(request.stateRoot, request.includeContextPacks ?? true);
    copyStateSnapshot(request.stateRoot, join(backupDir, "state"), [request.outputRoot, backupDir]);

    const manifest: BackupManifest = {
      backupId,
      createdAt,
      sourceStateRoot: request.stateRoot,
      includedRecords,
      includedArtifacts: coverage.artifacts,
      includedLogs: coverage.logs,
      includedMemory: coverage.memory,
      includedContextPacks: coverage.contextPacks,
      integrityStatus: "valid",
      redactionStatus: "not_applicable",
      localRef: backupDir,
      contentHash: hashObject({ includedRecords, coverage, backupId }),
      schemaVersion: SCHEMA_VERSION
    };
    writeFileSync(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return this.repository.save(manifest);
  }

  list(): BackupManifest[] {
    return this.repository.list();
  }

  get(backupId: string): BackupManifest | undefined {
    return this.repository.get(backupId);
  }
}

function collectCoverage(stateRoot: string, includeContextPacks: boolean) {
  return {
    artifacts: refsFor(join(stateRoot, "artifacts"), "artifact"),
    logs: refsFor(join(stateRoot, "logs"), "log"),
    memory: refsFor(join(stateRoot, "memory"), "memory"),
    contextPacks: includeContextPacks
      ? refsFor(join(stateRoot, "context"), "context").map((ref) =>
          makeId("ctx", basename(ref.uri))
        )
      : []
  };
}

function refsFor(path: string, type: string) {
  try {
    return readdirSync(path).map((entry) => ({ type, uri: join(path, entry) }));
  } catch {
    return [];
  }
}

function copyStateSnapshot(source: string, target: string, excludedPaths: string[]): void {
  mkdirSync(target, { recursive: true });
  if (!existsSync(source)) {
    return;
  }
  for (const entry of readdirSync(source)) {
    const sourceChild = join(source, entry);
    if (excludedPaths.some((excluded) => isSameOrInside(sourceChild, excluded))) {
      continue;
    }
    const targetChild = join(target, entry);
    const stat = statSync(sourceChild);
    if (stat.isDirectory()) {
      copyStateSnapshot(sourceChild, targetChild, excludedPaths);
      continue;
    }
    mkdirSync(dirname(targetChild), { recursive: true });
    cpSync(sourceChild, targetChild, { recursive: true, force: true, errorOnExist: false });
  }
}

function countSqliteRecords(stateRoot: string): Record<string, number> {
  const dbPath = join(stateRoot, "fulcrum.sqlite");
  try {
    const { size } = statSync(dbPath);
    return { sqliteBytes: size, sqliteCanonical: 1 };
  } catch {
    return countWorkStateRecords(stateRoot);
  }
}

function countWorkStateRecords(stateRoot: string): Record<string, number> {
  try {
    const data = JSON.parse(readFileSync(join(stateRoot, "work-state.json"), "utf8")) as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length])
    );
  } catch {
    return {};
  }
}

function readStore(storeFile: string): RecoveryStore {
  try {
    const data = JSON.parse(readFileSync(storeFile, "utf8")) as Partial<RecoveryStore>;
    return {
      backups: (data.backups ?? []).map((manifest) => BackupManifestSchema.parse(manifest)),
      exports: (data.exports ?? []).map((record) => ExportRecordSchema.parse(record))
    };
  } catch {
    return { ...emptyStore };
  }
}

function writeStore(storeFile: string, store: RecoveryStore): void {
  mkdirSync(dirname(storeFile), { recursive: true });
  writeFileSync(storeFile, JSON.stringify(store, null, 2));
}

function isSameOrInside(path: string, parent: string): boolean {
  const resolvedPath = resolve(path);
  const resolvedParent = resolve(parent);
  const pathRelativeToParent = relative(resolvedParent, resolvedPath);
  return (
    pathRelativeToParent === "" ||
    (!pathRelativeToParent.startsWith("..") && !isAbsolute(pathRelativeToParent))
  );
}

export function hashObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
