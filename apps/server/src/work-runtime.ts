import path from "node:path";
import {
  FileProjectRepository,
  FileTaskRepository,
  FileWorkRepository,
  LocalTaskService,
  ProjectRegistryService,
  resolveSetupPaths
} from "@fulcrum/core";

const work = new FileWorkRepository(
  path.join(resolveSetupPaths(process.env.FULCRUM_STATE_ROOT).stateRoot, "work-state.json")
);
const taskRepository = new FileTaskRepository(work);
const projectRepository = new FileProjectRepository(work);

export const serverTaskService = new LocalTaskService(taskRepository);
export const serverProjectService = new ProjectRegistryService(
  projectRepository,
  serverTaskService
);
