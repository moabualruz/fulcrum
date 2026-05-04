import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { LocalFsBackend, type StorageBackend } from "./storage.ts";

export interface PreviewArtifactLike {
  id: string;
  filename: string;
  mime?: string | null;
  sizeBytes?: bigint | number | string | null;
  path: string;
  checksumSha256?: string | null;
}

export type ArtifactPreview =
  | {
      kind: "text";
      artifact: PreviewArtifactLike;
      language: string | null;
      content: string;
      truncated: boolean;
    }
  | {
      kind: "image";
      artifact: PreviewArtifactLike;
      srcPath: string;
      mime: string;
      alt: string;
    }
  | {
      kind: "binary";
      artifact: PreviewArtifactLike;
      hexHeader: string;
      bytesShown: number;
    };

export interface BuildArtifactPreviewInput {
  artifact: PreviewArtifactLike;
  storageBackend?: StorageBackend;
  textLimitBytes?: number;
  binaryHeaderBytes?: number;
}

export interface ArtifactDownload {
  artifact: PreviewArtifactLike;
  filename: string;
  path: string;
  mime: string;
  sizeBytes: number;
  headers: Record<string, string>;
}

export interface DownloadArtifactInput {
  artifact: PreviewArtifactLike;
  storageBackend?: StorageBackend;
  outPath: string;
}

export interface DownloadArtifactResult {
  artifact: PreviewArtifactLike;
  outPath: string;
  filename: string;
  sizeBytes: number;
  checksumSha256: string | null;
}

const DEFAULT_TEXT_LIMIT_BYTES = 64 * 1024;
const DEFAULT_BINARY_HEADER_BYTES = 64;

const EXTENSION_LANGUAGES: Record<string, string> = {
  ".cjs": "javascript",
  ".css": "css",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "jsx",
  ".md": "markdown",
  ".mjs": "javascript",
  ".sh": "shellscript",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".txt": "text",
  ".yaml": "yaml",
  ".yml": "yaml",
};

export async function buildArtifactPreview(
  input: BuildArtifactPreviewInput,
): Promise<ArtifactPreview> {
  const mime = normalizedMime(input.artifact);
  if (mime.startsWith("image/")) {
    return {
      kind: "image",
      artifact: input.artifact,
      srcPath: input.artifact.path,
      mime,
      alt: input.artifact.filename,
    };
  }

  const storageBackend = input.storageBackend ?? new LocalFsBackend();
  if (isTextArtifact(input.artifact)) {
    const limit = input.textLimitBytes ?? DEFAULT_TEXT_LIMIT_BYTES;
    const content = await readPrefix(storageBackend, input.artifact.path, limit + 1);
    const truncated = content.byteLength > limit;
    return {
      kind: "text",
      artifact: input.artifact,
      language: languageFor(input.artifact),
      content: content.subarray(0, limit).toString("utf8"),
      truncated,
    };
  }

  const headerBytes = input.binaryHeaderBytes ?? DEFAULT_BINARY_HEADER_BYTES;
  const header = await readPrefix(storageBackend, input.artifact.path, headerBytes);
  return {
    kind: "binary",
    artifact: input.artifact,
    hexHeader: header.toString("hex"),
    bytesShown: header.byteLength,
  };
}

export function buildArtifactDownload(artifact: PreviewArtifactLike): ArtifactDownload {
  const filename = artifact.filename || artifact.id;
  const mime = normalizedMime(artifact);
  const sizeBytes = numberBytes(artifact.sizeBytes);
  return {
    artifact,
    filename,
    path: artifact.path,
    mime,
    sizeBytes,
    headers: {
      "Content-Disposition": `attachment; filename="${filename.replaceAll('"', '\\"')}"`,
      "Content-Length": String(sizeBytes),
      "Content-Type": mime,
    },
  };
}

export async function downloadArtifact(
  input: DownloadArtifactInput,
): Promise<DownloadArtifactResult> {
  await mkdir(path.dirname(input.outPath), { recursive: true });
  const storageBackend = input.storageBackend ?? new LocalFsBackend();
  await pipeline(await storageBackend.get(input.artifact.path), createWriteStream(input.outPath));

  return {
    artifact: input.artifact,
    outPath: input.outPath,
    filename: input.artifact.filename || input.artifact.id,
    sizeBytes: numberBytes(input.artifact.sizeBytes),
    checksumSha256: input.artifact.checksumSha256 ?? null,
  };
}

function isTextArtifact(artifact: PreviewArtifactLike): boolean {
  const mime = normalizedMime(artifact);
  if (mime.startsWith("text/")) return true;
  return [
    "application/json",
    "application/javascript",
    "application/typescript",
    "application/xml",
    "application/yaml",
  ].includes(mime);
}

function languageFor(artifact: PreviewArtifactLike): string | null {
  const ext = path.extname(artifact.filename).toLowerCase();
  return EXTENSION_LANGUAGES[ext] ?? null;
}

function normalizedMime(artifact: PreviewArtifactLike): string {
  return artifact.mime?.toLowerCase() || "application/octet-stream";
}

function numberBytes(value: PreviewArtifactLike["sizeBytes"]): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

async function readPrefix(
  storageBackend: StorageBackend,
  relativePath: string,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const stream = await storageBackend.get(relativePath);
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = maxBytes - total;
    chunks.push(buffer.subarray(0, remaining));
    total += Math.min(buffer.byteLength, remaining);
    if (total >= maxBytes) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks);
}
