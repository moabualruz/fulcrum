export type {
  ArtifactDetail,
  ArtifactFilter,
  ArtifactRow,
  ArtifactStats,
} from "@workflow-coordination/application/artifact-service-actions.ts";

type DeleteArtifactAction = typeof import("@workflow-coordination/application/artifact-service-actions.ts").deleteArtifactAction;
type DeleteArtifactForWeb = typeof import("@workflow-coordination/application/artifacts/commands.ts").deleteArtifactForWeb;
type GetArtifactDetail = typeof import("@workflow-coordination/application/artifacts/queries.ts").getArtifactDetail;
type GetArtifactStats = typeof import("@workflow-coordination/application/artifact-service-actions.ts").getArtifactStats;
type ListArtifacts = typeof import("@workflow-coordination/application/artifact-service-actions.ts").listArtifacts;
type ReadArtifactDetail = typeof import("@workflow-coordination/application/artifact-service-actions.ts").readArtifactDetail;

export async function getArtifactDetail(
  ...args: Parameters<GetArtifactDetail>
): Promise<Awaited<ReturnType<GetArtifactDetail>>> {
  const queries = await import("@workflow-coordination/application/artifacts/queries.ts");
  return queries.getArtifactDetail(...args);
}

export async function deleteArtifactForWeb(
  ...args: Parameters<DeleteArtifactForWeb>
): Promise<Awaited<ReturnType<DeleteArtifactForWeb>>> {
  const commands = await import("@workflow-coordination/application/artifacts/commands.ts");
  return commands.deleteArtifactForWeb(...args);
}

export async function listArtifacts(
  ...args: Parameters<ListArtifacts>
): Promise<Awaited<ReturnType<ListArtifacts>>> {
  const actions = await import("@workflow-coordination/application/artifact-service-actions.ts");
  return actions.listArtifacts(...args);
}

export async function readArtifactDetail(
  ...args: Parameters<ReadArtifactDetail>
): Promise<Awaited<ReturnType<ReadArtifactDetail>>> {
  const actions = await import("@workflow-coordination/application/artifact-service-actions.ts");
  return actions.readArtifactDetail(...args);
}

export async function deleteArtifactAction(
  ...args: Parameters<DeleteArtifactAction>
): Promise<Awaited<ReturnType<DeleteArtifactAction>>> {
  const actions = await import("@workflow-coordination/application/artifact-service-actions.ts");
  return actions.deleteArtifactAction(...args);
}

export async function getArtifactStats(
  ...args: Parameters<GetArtifactStats>
): Promise<Awaited<ReturnType<GetArtifactStats>>> {
  const actions = await import("@workflow-coordination/application/artifact-service-actions.ts");
  return actions.getArtifactStats(...args);
}
