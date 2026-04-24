import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  type CanonicalMigrationRecord,
  type CodeEvidence,
  type ContextItem,
  type ContextPack,
  type ExternalWorkItemMirror,
  type GraphLink,
  type MemoryEntry,
  type Project,
  type QualityGateDefinition,
  type QualityGateResult,
  type Run,
  type RunEvent,
  SCHEMA_VERSION,
  type Task,
  type WorktreeAllocation
} from "@fulcrum/shared";
import {
  emptyWorkState,
  type FileWorkRepository,
  type WorkState
} from "../work/file-repository.js";

export interface CanonicalWorkRepositories {
  projects: {
    save(project: Project): Project;
    list(): Project[];
  };
  tasks: {
    save(task: Task): Task;
    list(projectId?: string): Task[];
  };
  externalWorkItemMirrors: {
    save(mirror: ExternalWorkItemMirror): ExternalWorkItemMirror;
    list(projectId?: string): ExternalWorkItemMirror[];
  };
  codeEvidence: {
    save(evidence: CodeEvidence): CodeEvidence;
    list(projectId: string): CodeEvidence[];
  };
  memoryEntries: {
    save(entry: MemoryEntry): MemoryEntry;
    list(projectId?: string): MemoryEntry[];
  };
  runs: {
    save(run: Run): Run;
    appendEvent(event: Omit<RunEvent, "sequence">): RunEvent;
    list(projectId?: string): Run[];
    listEvents(runId: string): RunEvent[];
  };
  contextPacks: {
    savePack(pack: ContextPack): ContextPack;
    saveItems(items: ContextItem[]): ContextItem[];
    listPacks(projectId?: string): ContextPack[];
    listItems(contextPackId: string): ContextItem[];
  };
  worktrees: {
    save(worktree: WorktreeAllocation): WorktreeAllocation;
    list(projectId?: string): WorktreeAllocation[];
  };
  qualityGates: {
    saveDefinition(definition: QualityGateDefinition): QualityGateDefinition;
    saveResult(result: QualityGateResult): QualityGateResult;
    listDefinitions(projectId: string): QualityGateDefinition[];
    listResults(input: { projectId: string; runId?: string; taskId?: string }): QualityGateResult[];
  };
  graphLinks: {
    save(link: GraphLink): GraphLink;
    list(projectId?: string): GraphLink[];
  };
  migrationRecords?: {
    saveMigrationRecord(record: CanonicalMigrationRecord): CanonicalMigrationRecord;
  };
}

export interface JsonStateMigrationResult {
  migrated: boolean;
  source: "json" | "sqlite";
  counts: Record<keyof WorkState, number>;
  mirrorPath?: string;
}

export class JsonStateMigrationService {
  constructor(private readonly repositories: CanonicalWorkRepositories) {}

  migrateFromJsonMirror(fileWork: FileWorkRepository): JsonStateMigrationResult {
    const state = fileWork.read();
    const counts = countState(state);
    if (Object.values(counts).every((count) => count === 0)) {
      return { migrated: false, source: "sqlite", counts };
    }
    const sqliteCounts = countState(this.snapshot());
    if (Object.values(sqliteCounts).some((count) => count > 0)) {
      return { migrated: false, source: "sqlite", counts: sqliteCounts };
    }

    const record = createMigrationRecord(fileWork.filePath(), counts, state);
    try {
      for (const project of state.projects) this.repositories.projects.save(project);
      for (const task of state.tasks) this.repositories.tasks.save(task);
      for (const mirror of state.externalWorkItemMirrors) {
        this.repositories.externalWorkItemMirrors.save(mirror);
      }
      for (const evidence of state.codeEvidence) this.repositories.codeEvidence.save(evidence);
      for (const entry of state.memoryEntries) this.repositories.memoryEntries.save(entry);
      for (const run of state.runs) this.repositories.runs.save(run);
      for (const event of state.runEvents.sort((left, right) => left.sequence - right.sequence)) {
        this.repositories.runs.appendEvent(withoutSequence(event));
      }
      for (const pack of state.contextPacks) this.repositories.contextPacks.savePack(pack);
      for (const items of groupByContextPack(state.contextItems)) {
        this.repositories.contextPacks.saveItems(items);
      }
      for (const worktree of state.worktrees) this.repositories.worktrees.save(worktree);
      for (const definition of state.qualityGateDefinitions) {
        this.repositories.qualityGates.saveDefinition(definition);
      }
      for (const result of state.qualityGateResults)
        this.repositories.qualityGates.saveResult(result);
      for (const link of state.graphLinks) this.repositories.graphLinks.save(link);
      this.repositories.migrationRecords?.saveMigrationRecord({
        ...record,
        status: "imported",
        completedAt: new Date().toISOString()
      });
      return { migrated: true, source: "json", counts };
    } catch (error) {
      this.repositories.migrationRecords?.saveMigrationRecord({
        ...record,
        status: "failed",
        completedAt: new Date().toISOString(),
        repairAction: "Restore the JSON backup, repair SQLite, and rerun migration."
      });
      throw error;
    }
  }

  rebuildJsonMirror(fileWork: FileWorkRepository): JsonStateMigrationResult {
    const state = this.snapshot();
    fileWork.write(state);
    return { migrated: false, source: "sqlite", counts: countState(state) };
  }

  snapshot(): WorkState {
    const state = emptyWorkState();
    state.projects = this.repositories.projects.list();
    state.tasks = this.repositories.tasks.list();
    state.externalWorkItemMirrors = this.repositories.externalWorkItemMirrors.list();
    state.codeEvidence = state.projects.flatMap((project) =>
      this.repositories.codeEvidence.list(project.projectId)
    );
    state.memoryEntries = this.repositories.memoryEntries.list();
    state.runs = this.repositories.runs.list();
    state.runEvents = state.runs.flatMap((run) => this.repositories.runs.listEvents(run.runId));
    state.contextPacks = this.repositories.contextPacks.listPacks();
    state.contextItems = state.contextPacks.flatMap((pack) =>
      this.repositories.contextPacks.listItems(pack.contextPackId)
    );
    state.worktrees = this.repositories.worktrees.list();
    state.qualityGateDefinitions = state.projects.flatMap((project) =>
      this.repositories.qualityGates.listDefinitions(project.projectId)
    );
    state.qualityGateResults = state.projects.flatMap((project) =>
      this.repositories.qualityGates.listResults({ projectId: project.projectId })
    );
    state.graphLinks = this.repositories.graphLinks.list();
    return state;
  }
}

export function sqliteStateStatus(dbPath?: string): {
  state: "managed" | "blocked" | "guided";
  blocking: boolean;
  cause?: string;
  nextAction: string;
} {
  if (!dbPath) {
    return {
      state: "guided",
      blocking: true,
      cause: "Setup has not initialized local SQLite state.",
      nextAction: "Run fulcrum setup apply."
    };
  }
  if (!existsSync(dbPath)) {
    return {
      state: "blocked",
      blocking: true,
      cause: `SQLite state file missing: ${dbPath}`,
      nextAction: "Restore from backup or run fulcrum setup apply to create a new local database."
    };
  }
  try {
    const stat = statSync(dbPath);
    if (stat.size === 0) {
      return {
        state: "blocked",
        blocking: true,
        cause: `SQLite state file is empty: ${dbPath}`,
        nextAction: "Restore from backup or remove the empty database and rerun setup."
      };
    }
    const header = readFileSync(dbPath, { encoding: "utf8", flag: "r" }).slice(0, 16);
    if (header !== "SQLite format 3\0") {
      return {
        state: "blocked",
        blocking: true,
        cause: `SQLite state file is corrupt or not a SQLite database: ${dbPath}`,
        nextAction: "Restore from backup or move the corrupt database aside and rerun setup."
      };
    }
  } catch (error) {
    return {
      state: "blocked",
      blocking: true,
      cause: error instanceof Error ? error.message : `Cannot inspect SQLite state: ${dbPath}`,
      nextAction: "Check database file permissions, then rerun doctor."
    };
  }
  return { state: "managed", blocking: false, nextAction: "No action needed." };
}

function countState(state: WorkState): Record<keyof WorkState, number> {
  return {
    projects: state.projects.length,
    tasks: state.tasks.length,
    externalWorkItemMirrors: state.externalWorkItemMirrors.length,
    codeEvidence: state.codeEvidence.length,
    memoryEntries: state.memoryEntries.length,
    runs: state.runs.length,
    runEvents: state.runEvents.length,
    contextPacks: state.contextPacks.length,
    contextItems: state.contextItems.length,
    worktrees: state.worktrees.length,
    qualityGateDefinitions: state.qualityGateDefinitions.length,
    qualityGateResults: state.qualityGateResults.length,
    graphLinks: state.graphLinks.length
  };
}

function withoutSequence(event: RunEvent): Omit<RunEvent, "sequence"> {
  const { sequence: _sequence, ...rest } = event;
  return rest;
}

function groupByContextPack(items: ContextItem[]): ContextItem[][] {
  const groups = new Map<string, ContextItem[]>();
  for (const item of items) {
    groups.set(item.contextPackId, [...(groups.get(item.contextPackId) ?? []), item]);
  }
  return [...groups.values()];
}

function createMigrationRecord(
  sourcePath: string,
  counts: Record<keyof WorkState, number>,
  state: WorkState
): CanonicalMigrationRecord {
  const startedAt = new Date().toISOString();
  return {
    migrationId: normalizeMigrationId(`${sourcePath}-${startedAt}`),
    sourceKind: "JSON work-state",
    sourcePath,
    backupPath: backupJsonMirror(sourcePath, startedAt),
    entityCounts: counts,
    checksum: hashState(state),
    status: "pending",
    startedAt,
    schemaVersion: SCHEMA_VERSION
  };
}

function normalizeMigrationId(seed: string): CanonicalMigrationRecord["migrationId"] {
  const normalized = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `rebuild_${normalized || "json-state-migration"}`;
}

function backupJsonMirror(sourcePath: string, startedAt: string): string | undefined {
  if (!existsSync(sourcePath)) {
    return undefined;
  }
  const { dir, name, ext } = path.parse(sourcePath);
  const backupDir = path.join(dir, "backups", "json-state-migrations");
  const backupPath = path.join(backupDir, `${name}.${safeTimestamp(startedAt)}${ext || ".json"}`);
  mkdirSync(backupDir, { recursive: true });
  cpSync(sourcePath, backupPath, { force: true });
  return backupPath;
}

function safeTimestamp(timestamp: string): string {
  return timestamp.replace(/[:.]/g, "-");
}

function hashState(state: WorkState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
