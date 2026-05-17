import type { RequestEvent } from "@sveltejs/kit";
import { createArtifactApiCaller } from "@workflow-coordination/interface/http/artifact-api-client";
import { cookieHeaders, publicApiBaseUrl } from "$lib/server/public-api";

export interface PublicArtifact {
  id: string;
  projectId?: string | null;
  project_id?: string | null;
  runId?: string | null;
  run_id?: string | null;
  taskId?: string | null;
  task_id?: string | null;
  kind: string;
  title?: string;
  filename?: string | null;
  bodyPath?: string | null;
  body_path?: string | null;
  checksumSha256?: string | null;
  checksum_sha256?: string | null;
  sha256?: string | null;
  sizeBytes?: string | number | bigint | null;
  size_bytes?: string | number | bigint | null;
  size?: string | number | bigint | null;
  mime?: string | null;
  archived?: boolean;
  createdAt?: string;
  created_at?: string;
}

type ArtifactApiEvent = Pick<RequestEvent, "fetch" | "request" | "url">;

export function createArtifactApiForEvent(event: ArtifactApiEvent) {
  return createArtifactApiCaller({
    baseUrl: publicApiBaseUrl(event.url),
    fetch: event.fetch,
    headers: cookieHeaders(event.request),
  });
}

export function toArtifactRow(artifact: PublicArtifact) {
  return {
    id: artifact.id,
    org_id: "",
    project_id: artifact.projectId ?? artifact.project_id ?? null,
    run_id: artifact.runId ?? artifact.run_id ?? null,
    task_id: artifact.taskId ?? artifact.task_id ?? null,
    kind: artifact.kind,
    title: artifact.title ?? artifact.filename ?? artifact.id,
    body_path: artifact.bodyPath ?? artifact.body_path ?? null,
    sha256: artifact.checksumSha256 ?? artifact.checksum_sha256 ?? artifact.sha256 ?? null,
    size: artifactSize(artifact),
    mime: artifact.mime ?? null,
    archived: artifact.archived ?? false,
    created_at: artifact.createdAt ?? artifact.created_at ?? "",
  };
}

export function artifactStatsFromRows(artifacts: PublicArtifact[]) {
  return artifacts.reduce(
    (stats, artifact) => ({
      count: stats.count + 1,
      totalBytes: stats.totalBytes + (artifactSize(artifact) ?? 0),
    }),
    { count: 0, totalBytes: 0 },
  );
}

function artifactSize(artifact: PublicArtifact): number | null {
  const value = artifact.sizeBytes ?? artifact.size_bytes ?? artifact.size;
  if (value === null || value === undefined) return null;
  const size = Number(value);
  return Number.isFinite(size) ? size : null;
}
