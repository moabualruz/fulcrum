import path from "node:path";
import {
  CodeEvidenceService,
  FileCodeEvidenceRepository,
  FileMemoryRepository,
  FileProjectRepository,
  FileQualityGateRepository,
  FileContextPackRepository,
  FileExternalWorkItemMirrorRepository,
  FileGraphLinkRepository,
  FileRunRepository,
  FileTaskRepository,
  FileWorktreeRepository,
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
  TraceabilityQueryService,
  resolveSetupPaths
} from "@fulcrum/core";
import { searchExact, searchSemantic } from "@fulcrum/code-tools";
import { PlaneApiAdapter, SimulatedPlaneAdapter } from "@fulcrum/plane";

const setupPaths = resolveSetupPaths(process.env.FULCRUM_STATE_ROOT);
const work = new FileWorkRepository(path.join(setupPaths.stateRoot, "work-state.json"));
const taskRepository = new FileTaskRepository(work);
const projectRepository = new FileProjectRepository(work);
export const runRepository = new FileRunRepository(work);
export const serverQualityGateRepository = new FileQualityGateRepository(work);
const worktreeRepository = new FileWorktreeRepository(work);
const graphRepository = new FileGraphLinkRepository(work);
export const serverGraphService = new GraphLinkService(graphRepository);
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
  new FileMemoryRepository(work),
  undefined,
  serverGraphLinkWriters
);
export const serverContextBuilder = new ContextPackBuilder(
  new FileContextPackRepository(work),
  taskRepository,
  projectRepository,
  serverGraphLinkWriters
);
export const serverCodeService = new CodeEvidenceService(
  projectRepository,
  new FileCodeEvidenceRepository(work),
  {
    search: (options) => searchExact(options)
  },
  searchSemantic,
  serverGraphLinkWriters
);
export function serverGraphRebuildSources(projectId: string) {
  const state = work.read();
  return {
    tasks: state.tasks.filter((task) => task.projectId === projectId),
    memories: state.memoryEntries.filter((entry) => entry.projectId === projectId),
    codeEvidence: state.codeEvidence.filter((evidence) => evidence.projectId === projectId),
    runs: state.runs.filter((run) => run.projectId === projectId),
    contextPacks: state.contextPacks.filter((pack) => pack.projectId === projectId),
    contextItems: state.contextItems,
    qualityResults: state.qualityGateResults.filter((result) => result.projectId === projectId)
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
  new FileExternalWorkItemMirrorRepository(work),
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
