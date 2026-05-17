import type { EntityManager } from "typeorm";

import type {
  ProjectConnectorRow,
  UpsertConnectorInput,
} from "@integration-hub/application/project-connectors/commands.ts";

export type {
  ProjectConnectorRow,
  UpsertConnectorInput,
};

export async function upsertProjectConnector(
  em: EntityManager,
  input: UpsertConnectorInput,
): Promise<{ id: string }> {
  const service = await import("@integration-hub/application/project-connectors/commands.ts");
  return service.upsertProjectConnector(em, input);
}

export async function syncProjectConnector(em: EntityManager, id: string): Promise<{ ok: true }> {
  const service = await import("@integration-hub/application/project-connectors/commands.ts");
  return service.syncProjectConnector(em, id);
}

export async function listProjectConnectors(
  em: EntityManager,
  projectId: string,
): Promise<ProjectConnectorRow[]> {
  const service = await import("@integration-hub/application/project-connectors/commands.ts");
  return service.listProjectConnectors(em, projectId);
}
