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
import {
  CodeEvidenceService,
  FileWorkRepository,
  FileAdapterConfigurationRepository,
  ContextPackBuilder,
  AdapterRegistryService,
  createDefaultAdapterHealthModules,
  ExternalPmService,
  LocalTaskService,
  MemoryService,
  ProjectRegistryService,
  RunLifecycleService,
  WorktreeAllocationService,
  WorktreeStatusService,
  GraphLinkService,
  GraphLinkWriters,
  InvalidationService,
  TraceabilityQueryService,
  JsonStateMigrationService,
  resolveSetupPaths
} from "@fulcrum/core";
import { searchExact, searchSemantic } from "@fulcrum/code-tools";
import { PlaneApiAdapter, SimulatedPlaneAdapter } from "@fulcrum/plane";

const setupPaths = resolveSetupPaths(process.env.FULCRUM_STATE_ROOT);
const db = openDatabase(setupPaths.dbPath);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
migrate(db, path.join(repoRoot, "packages/db/migrations"));
const workMirror = new FileWorkRepository(path.join(setupPaths.stateRoot, "work-state.json"));
const taskRepository = new TaskRepository(db);
const projectRepository = new ProjectRepository(db);
export const runRepository = new RunRepository(db);
export const serverQualityGateRepository = new QualityGateRepository(db);
const worktreeRepository = new WorktreeRepository(db);
const graphRepository = new GraphLinkRepository(db);
const contextPackRepository = new ContextPackRepository(db);
const memoryRepository = new MemoryRepository(db);
const codeEvidenceRepository = new CodeEvidenceRepository(db);
const externalWorkItemMirrorRepository = new ExternalWorkItemMirrorRepository(db);
const readinessRepository = new ReadinessRepository(db);
new JsonStateMigrationService({
  projects: projectRepository,
  tasks: taskRepository,
  externalWorkItemMirrors: externalWorkItemMirrorRepository,
  codeEvidence: codeEvidenceRepository,
  memoryEntries: memoryRepository,
  runs: runRepository,
  contextPacks: contextPackRepository,
  worktrees: worktreeRepository,
  qualityGates: serverQualityGateRepository,
  graphLinks: graphRepository,
  migrationRecords: readinessRepository
}).migrateFromJsonMirror(workMirror);
export const serverInvalidationService = new InvalidationService(readinessRepository);
export const serverGraphService = new GraphLinkService(graphRepository, serverInvalidationService);
export const serverGraphLinkWriters = new GraphLinkWriters(serverGraphService);
export const serverTraceabilityService = new TraceabilityQueryService(graphRepository);

export const serverTaskService = new LocalTaskService(taskRepository);
export const serverProjectService = new ProjectRegistryService(
  projectRepository,
  serverTaskService
);
export const serverWorktreeAllocationService = new WorktreeAllocationService(
  worktreeRepository,
  taskRepository,
  projectRepository
);
export const serverWorktreeStatusService = new WorktreeStatusService(
  worktreeRepository,
  runRepository
);
export const serverRunService = new RunLifecycleService(
  runRepository,
  taskRepository,
  serverWorktreeAllocationService,
  worktreeRepository,
  serverGraphLinkWriters
);
export const serverMemoryService = new MemoryService(
  memoryRepository,
  undefined,
  serverGraphLinkWriters,
  serverInvalidationService
);
export const serverContextBuilder = new ContextPackBuilder(
  contextPackRepository,
  taskRepository,
  projectRepository,
  serverGraphLinkWriters,
  serverInvalidationService
);
export const serverCodeService = new CodeEvidenceService(
  projectRepository,
  codeEvidenceRepository,
  {
    search: (options) => searchExact(options)
  },
  searchSemantic,
  serverGraphLinkWriters,
  serverInvalidationService
);
export function serverGraphRebuildSources(projectId: string) {
  return {
    tasks: taskRepository.list(projectId),
    memories: memoryRepository.list(projectId),
    codeEvidence: codeEvidenceRepository.list(projectId),
    runs: runRepository.list(projectId),
    contextPacks: contextPackRepository.listPacks(projectId),
    contextItems: contextPackRepository
      .listPacks(projectId)
      .flatMap((pack) => contextPackRepository.listItems(pack.contextPackId)),
    qualityResults: serverQualityGateRepository.listResults({ projectId })
  };
}
const planeAdapter =
  process.env.FULCRUM_PLANE_BASE_URL && process.env.FULCRUM_PLANE_TOKEN
    ? new PlaneApiAdapter({
        baseUrl: process.env.FULCRUM_PLANE_BASE_URL,
        token: process.env.FULCRUM_PLANE_TOKEN
      })
    : new SimulatedPlaneAdapter([
        {
          externalId: "SIM-1",
          title: "Simulated Plane work item",
          body: "Imported from simulated Plane adapter.",
          status: "todo",
          updatedAt: new Date(0).toISOString(),
          url: "plane://SIM-1",
          docs: [{ title: "Plane docs page", url: "plane://SIM-1/docs" }]
        }
      ]);
export const serverExternalPmService = new ExternalPmService(
  externalWorkItemMirrorRepository,
  taskRepository,
  planeAdapter,
  projectRepository
);
export const serverAdapterRegistry = new AdapterRegistryService(
  createDefaultAdapterHealthModules(),
  new FileAdapterConfigurationRepository(
    path.join(setupPaths.stateRoot, "adapter-configurations.json")
  )
);
