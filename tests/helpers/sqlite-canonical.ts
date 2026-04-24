import {
  CodeEvidenceRepository,
  ContextPackRepository,
  ExternalWorkItemMirrorRepository,
  GraphLinkRepository,
  MemoryRepository,
  ProjectRepository,
  QualityGateRepository,
  ReadinessRepository,
  RunRepository,
  TaskRepository,
  WorktreeRepository,
  type openDatabase
} from "@fulcrum/db";
import { JsonStateMigrationService } from "@fulcrum/core";
import { SCHEMA_VERSION, type Project, type Task } from "@fulcrum/shared";

export function createMigration(
  db: ReturnType<typeof openDatabase>,
  readiness = new ReadinessRepository(db)
): JsonStateMigrationService {
  const projects = new ProjectRepository(db);
  const tasks = new TaskRepository(db);
  const runs = new RunRepository(db);
  const contextPacks = new ContextPackRepository(db);
  const qualityGates = new QualityGateRepository(db);
  return new JsonStateMigrationService({
    projects,
    tasks,
    externalWorkItemMirrors: new ExternalWorkItemMirrorRepository(db),
    codeEvidence: new CodeEvidenceRepository(db),
    memoryEntries: new MemoryRepository(db),
    runs,
    contextPacks,
    worktrees: new WorktreeRepository(db),
    qualityGates,
    graphLinks: new GraphLinkRepository(db),
    migrationRecords: readiness
  });
}

export function project(overrides: Partial<Project> = {}): Project {
  const now = new Date(0).toISOString();
  return {
    projectId: "proj_sqlite",
    name: "SQLite Project",
    rootPath: "/tmp/sqlite-project",
    defaultBranch: "main",
    worktreePolicyId: "pol_worktree",
    ignoredPathPolicyId: "pol_ignore",
    qualityGateSetId: "gate_default",
    privacyMode: "local_only",
    healthState: "managed",
    enabledCapabilities: [],
    disabledCapabilities: [],
    adapterMappings: {},
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    ...overrides
  };
}

export function task(overrides: Partial<Task> = {}): Task {
  const now = new Date(0).toISOString();
  return {
    taskId: "task_sqlite",
    projectId: "proj_sqlite",
    title: "Canonical task",
    status: "pending",
    priority: "normal",
    labels: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    ...overrides
  };
}
