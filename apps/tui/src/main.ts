import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CodeEvidenceRepository,
  ContextPackRepository,
  ExternalWorkItemMirrorRepository,
  GraphLinkRepository,
  MemoryRepository,
  migrate,
  openDatabase,
  ProjectRepository,
  QualityGateRepository,
  ReadinessRepository,
  RunRepository,
  TaskRepository,
  WorktreeRepository
} from "@fulcrum/db";
import { FileWorkRepository, JsonStateMigrationService, resolveSetupPaths } from "@fulcrum/core";
import { createAllTuiViews, renderTuiView } from "./views/index.js";

const viewName = process.argv[2] as keyof ReturnType<typeof createAllTuiViews> | undefined;
const setupPaths = resolveSetupPaths(process.env.FULCRUM_STATE_ROOT);
const db = openDatabase(setupPaths.dbPath);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
migrate(db, path.join(repoRoot, "packages/db/migrations"));
const workMirror = new FileWorkRepository(path.join(setupPaths.stateRoot, "work-state.json"));
const projects = new ProjectRepository(db);
const tasks = new TaskRepository(db);
const runs = new RunRepository(db);
const contextPacks = new ContextPackRepository(db);
const qualityGates = new QualityGateRepository(db);
const readinessRepository = new ReadinessRepository(db);
const migration = new JsonStateMigrationService({
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
  migrationRecords: readinessRepository
});
migration.migrateFromJsonMirror(workMirror);
const views = createAllTuiViews(migration.snapshot());
const selected = views[viewName ?? "dashboard"] ?? views.dashboard;

console.log(renderTuiView(selected));
