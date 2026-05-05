import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { LocalFsBackend, type StorageBackend } from "./storage.ts";

const require = createRequire(import.meta.url);
const { lookup } = require("mime-types") as { lookup: (filename: string) => string | false };

export interface HarvestArtifactsInput {
  runId: string;
  extractedDir: string;
  orgSlug: string;
  projectSlug?: string | null;
  sourceGlob?: string | null;
  deps: HarvestArtifactDeps;
}

export interface HarvestArtifactDeps {
  storageBackend?: StorageBackend;
  artifactRepository: ArtifactRepositoryLike;
  edgeRepository: EdgeRepositoryLike;
  searchDocumentRepository: SearchDocumentRepositoryLike;
  eventRepository: EventRepositoryLike;
  projectRepository?: ProjectRepositoryLike;
  agentRunRepository?: AgentRunRepositoryLike;
}

export interface HarvestArtifactsResult {
  artifacts: ArtifactLike[];
}

export interface ArtifactLike {
  id: string;
  org?: unknown;
  run?: unknown;
  filename: string;
  mime?: string;
  sizeBytes?: bigint;
  path: string;
  checksumSha256?: string;
  retentionUntil?: Date;
  metadataJson?: Record<string, unknown>;
}

interface ArtifactRepositoryLike {
  findDuplicate?: (input: {
    runId: string;
    filename: string;
    checksumSha256: string;
  }) => Promise<ArtifactLike | undefined> | ArtifactLike | undefined;
  findOne?: (where: unknown) => Promise<ArtifactLike | undefined> | ArtifactLike | undefined;
  create: (input: Record<string, unknown>) => Promise<ArtifactLike> | ArtifactLike;
}

interface EdgeRepositoryLike {
  createMany: (input: Record<string, unknown>[]) => Promise<unknown> | unknown;
}

interface SearchDocumentRepositoryLike {
  upsertArtifactPreview: (input: {
    org?: unknown;
    artifact: ArtifactLike;
    title: string;
    body: string;
    mime: string | null;
    sizeBytes: bigint;
    runId: string;
    projectId: string | null;
    artifactKind: string;
    orgId: string;
    metadata: Record<string, unknown>;
  }) => Promise<unknown> | unknown;
}

interface EventRepositoryLike {
  recordArtifactHarvested: (input: {
    org?: unknown;
    run?: unknown;
    artifact: ArtifactLike;
  }) => Promise<unknown> | unknown;
}

interface ProjectRepositoryLike {
  retentionUntil?: (input: {
    orgSlug: string;
    projectSlug?: string | null;
  }) => Promise<Date | undefined> | Date | undefined;
}

interface AgentRunRepositoryLike {
  findOneOrFail?: (where: unknown) => Promise<unknown> | unknown;
}

export const ARTIFACT_RUN_EDGE_KIND = "produced";
export const ARTIFACT_RUN_REVERSE_EDGE_KIND = "generated_by";
export const ARTIFACT_KIND = "artifact";
export const SUPPORTED_INLINE_PREVIEW_MIME = [
  "image/png",
  "text/plain",
  "text/markdown",
  "text/javascript",
  "application/javascript",
  "application/json",
] as const;

export type ArtifactPreviewKind = "image" | "text" | "markdown" | "code" | "download";

export async function harvestArtifacts(input: HarvestArtifactsInput): Promise<HarvestArtifactsResult> {
  const storageBackend = input.deps.storageBackend ?? new LocalFsBackend();
  const run = await findRun(input.deps.agentRunRepository, input.runId);
  const org = orgFromRun(run);
  const orgId = idFromObject(org);
  const projectId = projectIdFromRun(run);
  const retentionUntil = await input.deps.projectRepository?.retentionUntil?.({
    orgSlug: input.orgSlug,
    projectSlug: input.projectSlug,
  });
  const artifacts: ArtifactLike[] = [];

  for (const sourcePath of await listFiles(input.extractedDir)) {
    const filename = path.basename(sourcePath);
    const [checksumSha256, fileStat] = await Promise.all([sha256File(sourcePath), stat(sourcePath)]);
    const sourceRelativePath = path.relative(input.extractedDir, sourcePath);
    const duplicate = await findDuplicate(input.deps.artifactRepository, {
      runId: input.runId,
      filename,
      checksumSha256,
    });
    if (duplicate) {
      artifacts.push(duplicate);
      continue;
    }

    const mime = sniffMime(filename);
    const previewKind = previewKindForArtifact({ mime, filename });
    const metadataJson = artifactMetadata({
      checksumSha256,
      sourcePath: sourceRelativePath,
      sourceGlob: input.sourceGlob ?? null,
      harvestedAt: new Date(),
      producerKind: "agent_run",
      producerId: input.runId,
      runId: input.runId,
      edgeId: null,
      previewKind,
    });
    const stored = await storageBackend.put({
      orgSlug: input.orgSlug,
      projectSlug: input.projectSlug,
      runId: input.runId,
      filename,
      source: sourcePath,
    });
    const artifact = await input.deps.artifactRepository.create({
      org,
      run,
      filename,
      mime,
      sizeBytes: BigInt(fileStat.size),
      path: stored.relativePath,
      checksumSha256,
      retentionUntil,
      artifactKind: ARTIFACT_KIND,
      sourcePath: sourceRelativePath,
      sourceGlob: input.sourceGlob ?? null,
      harvestedAt: metadataJson.harvestedAt,
      producerKind: "agent_run",
      producerId: input.runId,
      runId: input.runId,
      projectId,
      metadataJson,
    });

    await input.deps.edgeRepository.createMany([
      {
        org,
        fromKind: "artifact",
        fromId: artifact.id,
        toKind: "agent_run",
        toId: input.runId,
        artifactId: artifact.id,
        runId: input.runId,
        kind: ARTIFACT_RUN_REVERSE_EDGE_KIND,
      },
      {
        org,
        fromKind: "agent_run",
        fromId: input.runId,
        toKind: "artifact",
        toId: artifact.id,
        artifactId: artifact.id,
        runId: input.runId,
        kind: ARTIFACT_RUN_EDGE_KIND,
      },
    ]);
    await input.deps.searchDocumentRepository.upsertArtifactPreview({
      org,
      artifact,
      title: filename,
      body: await previewBody(sourcePath, mime, filename),
      mime,
      sizeBytes: BigInt(fileStat.size),
      runId: input.runId,
      projectId,
      artifactKind: ARTIFACT_KIND,
      orgId,
      metadata: {
        ...metadataJson,
        sha256: checksumSha256,
        sizeBytes: BigInt(fileStat.size).toString(),
        mime,
        projectId,
        artifactId: artifact.id,
      },
    });
    await input.deps.eventRepository.recordArtifactHarvested({ org, run, artifact });
    artifacts.push(artifact);
  }

  return { artifacts };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(absolutePath);
      if (entry.isFile()) return [absolutePath];
      return [];
    }),
  );
  return files.flat().sort();
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function sniffMime(filename: string): string {
  return lookup(filename) || "application/octet-stream";
}

export function previewKindForArtifact(input: { mime?: string | null; filename?: string | null }): ArtifactPreviewKind {
  const mime = input.mime ?? "application/octet-stream";
  const filename = input.filename ?? "";
  if (mime === "image/png") return "image";
  if (mime === "text/markdown" || path.extname(filename) === ".md") return "markdown";
  if (isCodeMime(mime) || isCodeFilename(filename)) return "code";
  if (isTextMime(mime) || isTextFilename(filename)) return "text";
  return "download";
}

async function previewBody(filePath: string, mime: string, filename: string): Promise<string> {
  const previewKind = previewKindForArtifact({ mime, filename });
  if (previewKind !== "text" && previewKind !== "markdown" && previewKind !== "code") return "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of createReadStream(filePath, { highWaterMark: 2048 })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    size += buffer.length;
    if (size >= 2000) break;
  }
  return Buffer.concat(chunks).subarray(0, 2000).toString("utf8");
}

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json" || mime.endsWith("+json");
}

function isCodeMime(mime: string): boolean {
  return mime === "application/javascript" || mime === "text/javascript" || mime.endsWith("+xml");
}

function isTextFilename(filename: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".toml", ".yaml", ".yml"].includes(
    path.extname(filename),
  );
}

function isCodeFilename(filename: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".xml"].includes(path.extname(filename));
}

async function findRun(repository: AgentRunRepositoryLike | undefined, runId: string): Promise<unknown> {
  return repository?.findOneOrFail?.({ id: runId }) ?? { id: runId };
}

function orgFromRun(run: unknown): unknown {
  return typeof run === "object" && run !== null && "org" in run ? run.org : undefined;
}

function idFromObject(value: unknown): string {
  if (typeof value === "object" && value !== null && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return "";
}

function projectIdFromRun(run: unknown): string | null {
  if (typeof run !== "object" || run === null || !("project" in run)) return null;
  return idFromObject(run.project) || null;
}

async function findDuplicate(
  repository: ArtifactRepositoryLike,
  input: { runId: string; filename: string; checksumSha256: string },
): Promise<ArtifactLike | undefined> {
  if (repository.findDuplicate) return repository.findDuplicate(input);
  return repository.findOne?.({
    run: input.runId,
    filename: input.filename,
    checksumSha256: input.checksumSha256,
  });
}

function artifactMetadata(input: {
  checksumSha256: string;
  sourcePath: string;
  sourceGlob: string | null;
  harvestedAt: Date;
  producerKind: string;
  producerId: string;
  runId: string;
  edgeId: string | null;
  previewKind: ArtifactPreviewKind;
}): Record<string, unknown> {
  return {
    sha256: input.checksumSha256,
    sourcePath: input.sourcePath,
    sourceGlob: input.sourceGlob,
    harvestedAt: input.harvestedAt.toISOString(),
    producerKind: input.producerKind,
    producerId: input.producerId,
    runId: input.runId,
    edgeId: input.edgeId,
    previewKind: input.previewKind,
    attestation: {
      subjectDigest: input.checksumSha256,
      predicateType: null,
      issuer: null,
      signedAt: null,
    },
  };
}
