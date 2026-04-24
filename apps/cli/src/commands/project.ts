import type { ProjectRegistryService } from "@fulcrum/core";

export function registerProjectCommand(
  service: ProjectRegistryService,
  input: { rootPath: string; name?: string }
) {
  return service.register(input);
}

export function listProjectsCommand(service: ProjectRegistryService) {
  return service.overview();
}
