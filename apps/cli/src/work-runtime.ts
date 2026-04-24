import path from "node:path";
import {
  CodeEvidenceService,
  FileCodeEvidenceRepository,
  FileMemoryRepository,
  FileProjectRepository,
  FileQualityGateRepository,
  FileContextPackRepository,
  FileExternalWorkItemMirrorRepository,
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
  resolveSetupPaths
} from "@fulcrum/core";
import { searchExact, searchSemantic } from "@fulcrum/code-tools";
import { PlaneApiAdapter, SimulatedPlaneAdapter } from "@fulcrum/plane";

const setupPaths = resolveSetupPaths(process.env.FULCRUM_STATE_ROOT);
const work = new FileWorkRepository(path.join(setupPaths.stateRoot, "work-state.json"));
const taskRepository = new FileTaskRepository(work);
const projectRepository = new FileProjectRepository(work);
export const runRepository = new FileRunRepository(work);
export const qualityGateRepository = new FileQualityGateRepository(work);
const worktreeRepository = new FileWorktreeRepository(work);

export const taskService = new LocalTaskService(taskRepository);
export const projectService = new ProjectRegistryService(projectRepository, taskService);
export const worktreeAllocationService = new WorktreeAllocationService(
  worktreeRepository,
  taskRepository,
  projectRepository
);
export const worktreeStatusService = new WorktreeStatusService(worktreeRepository, runRepository);
export const runService = new RunLifecycleService(
  runRepository,
  taskRepository,
  worktreeAllocationService,
  worktreeRepository
);
export const contextBuilder = new ContextPackBuilder(
  new FileContextPackRepository(work),
  taskRepository,
  projectRepository
);
export const memoryService = new MemoryService(new FileMemoryRepository(work));
export const codeService = new CodeEvidenceService(
  projectRepository,
  new FileCodeEvidenceRepository(work),
  {
    search: (options) => searchExact(options)
  },
  searchSemantic
);
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
export const externalPmService = new ExternalPmService(
  new FileExternalWorkItemMirrorRepository(work),
  taskRepository,
  planeAdapter,
  projectRepository
);
export const adapterRegistry = new AdapterRegistryService(
  createDefaultAdapterHealthModules(),
  new FileAdapterConfigurationRepository(
    path.join(setupPaths.stateRoot, "adapter-configurations.json")
  )
);
