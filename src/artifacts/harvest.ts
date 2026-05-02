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

export async function harvestArtifacts(input: HarvestArtifactsInput): Promise<HarvestArtifactsResult> {
  const storageBackend = input.deps.storageBackend ?? new LocalFsBackend();
  const run = await findRun(input.deps.agentRunRepository, input.runId);
  const retentionUntil = await input.deps.projectRepository?.retentionUntil?.({
    orgSlug: input.orgSlug,
    projectSlug: input.projectSlug,
  });
  const artifacts: ArtifactLike[] = [];

  for (const sourcePath of await listFiles(input.extractedDir)) {
    const filename = path.basename(sourcePath);
    const [checksumSha256, fileStat] = await Promise.all([sha256File(sourcePath), stat(sourcePath)]);
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
    const stored = await storageBackend.put({
      orgSlug: input.orgSlug,
      projectSlug: input.projectSlug,
      runId: input.runId,
      filename,
      source: sourcePath,
    });
    const org = orgFromRun(run);
    const artifact = await input.deps.artifactRepository.create({
      org,
      run,
      filename,
      mime,
      sizeBytes: BigInt(fileStat.size),
      path: stored.relativePath,
      checksumSha256,
      retentionUntil,
      metadataJson: {},
    });

    await input.deps.edgeRepository.createMany([
      {
        org,
        fromKind: "artifact",
        fromId: artifact.id,
        toKind: "agent_run",
        toId: input.runId,
        kind: "generated_by",
      },
      {
        org,
        fromKind: "agent_run",
        fromId: input.runId,
        toKind: "artifact",
        toId: artifact.id,
        kind: "produced",
      },
    ]);
    await input.deps.searchDocumentRepository.upsertArtifactPreview({
      org,
      artifact,
      title: filename,
      body: await previewBody(sourcePath, mime, filename),
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

async function previewBody(filePath: string, mime: string, filename: string): Promise<string> {
  if (!isTextMime(mime) && !isTextFilename(filename)) return "";
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

function isTextFilename(filename: string): boolean {
  return [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".toml", ".yaml", ".yml"].includes(
    path.extname(filename),
  );
}

async function findRun(repository: AgentRunRepositoryLike | undefined, runId: string): Promise<unknown> {
  return repository?.findOneOrFail?.({ id: runId }) ?? { id: runId };
}

function orgFromRun(run: unknown): unknown {
  return typeof run === "object" && run !== null && "org" in run ? run.org : undefined;
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
