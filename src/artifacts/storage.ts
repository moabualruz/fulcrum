import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, open, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import { injectable as Injectable } from "@needle-di/core";

export interface StorageBackend {
  put(input: PutArtifactInput): Promise<StoredArtifact>;
  get(relativePath: string): Promise<ReadStream>;
  delete(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
}

export interface PutArtifactInput {
  orgSlug: string;
  projectSlug?: string | null;
  runId?: string | null;
  filename: string;
  source: string | Readable;
}

export interface StoredArtifact {
  relativePath: string;
  absolutePath: string;
}

export interface ArtifactStorageEvent {
  name: "artifact.harvest.failed";
  code: "ARTIFACT_DISK_FULL";
  relativePath: string;
}

export interface LocalFsBackendOptions {
  root?: string;
  emit?: (event: ArtifactStorageEvent) => void;
  openWriteStream?: (absolutePath: string) => Promise<Writable> | Writable;
}

export interface CreateStorageBackendOptions extends LocalFsBackendOptions {
  s3Enabled?: boolean;
}

export class ArtifactStorageFullError extends Error {
  readonly code = "ARTIFACT_DISK_FULL" as const;

  constructor(readonly relativePath: string) {
    super(`Artifact store is full while writing ${relativePath}.`);
    this.name = "ArtifactStorageFullError";
  }
}

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function resolveArtifactStoreRoot(): string {
  return process.env.FULCRUM_ARTIFACT_STORE
    ? path.resolve(process.env.FULCRUM_ARTIFACT_STORE)
    : path.resolve(homedir(), ".fulcrum/artifacts");
}

export class LocalFsBackend implements StorageBackend {
  readonly root: string;
  private readonly emit?: (event: ArtifactStorageEvent) => void;
  private readonly openWriteStream: (absolutePath: string) => Promise<Writable> | Writable;

  constructor(options: LocalFsBackendOptions = {}) {
    this.root = path.resolve(options.root ?? resolveArtifactStoreRoot());
    this.emit = options.emit;
    this.openWriteStream = options.openWriteStream ?? defaultOpenWriteStream;
  }

  async put(input: PutArtifactInput): Promise<StoredArtifact> {
    const dir = path.join(
      segment(input.orgSlug, "orgSlug"),
      segment(input.projectSlug ?? "global", "projectSlug"),
      segment(input.runId ?? "manual", "runId"),
    );
    const relativePath = await this.availablePath(dir, input.filename);
    const absolutePath = this.absolutePath(relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });

    try {
      await pipeline(sourceStream(input.source), await this.openWriteStream(absolutePath));
      return { relativePath, absolutePath };
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      if (isNoSpace(error)) {
        this.emit?.({
          name: "artifact.harvest.failed",
          code: "ARTIFACT_DISK_FULL",
          relativePath,
        });
        throw new ArtifactStorageFullError(relativePath);
      }
      throw error;
    }
  }

  async get(relativePath: string): Promise<ReadStream> {
    return createReadStream(this.absolutePath(relativePath));
  }

  async delete(relativePath: string): Promise<void> {
    await unlink(this.absolutePath(relativePath)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const handle = await open(this.absolutePath(relativePath), "r");
      await handle.close();
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private async availablePath(dir: string, filename: string): Promise<string> {
    const cleanFilename = segment(filename, "filename");
    let relativePath = path.join(dir, cleanFilename);
    while (await this.exists(relativePath)) {
      const parsed = path.parse(cleanFilename);
      relativePath = path.join(dir, `${parsed.name}_${ulidSuffix()}${parsed.ext}`);
    }
    return relativePath;
  }

  private absolutePath(relativePath: string): string {
    const absolutePath = path.resolve(this.root, relativePath);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    if (absolutePath !== this.root && !absolutePath.startsWith(rootWithSep)) {
      throw new Error(`Artifact path escapes store root: ${relativePath}`);
    }
    return absolutePath;
  }
}

Injectable()(LocalFsBackend);

export function createStorageBackend(
  options: CreateStorageBackendOptions = {},
): StorageBackend {
  if (options.s3Enabled) {
    throw new Error("S3 artifact storage is gated and not enabled in this build.");
  }
  return new LocalFsBackend(options);
}

async function defaultOpenWriteStream(absolutePath: string): Promise<Writable> {
  const handle = await open(absolutePath, "wx");
  return handle.createWriteStream();
}

function sourceStream(source: string | Readable): Readable {
  return typeof source === "string" ? createReadStream(source) : source;
}

function segment(value: string, name: string): string {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\")) {
    throw new Error(`Invalid artifact ${name}: ${value}`);
  }
  return value;
}

function ulidSuffix(): string {
  let value = "";
  for (const byte of randomBytes(26)) {
    value += ULID_ALPHABET[byte % ULID_ALPHABET.length];
  }
  return value;
}

function isNoSpace(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOSPC";
}
