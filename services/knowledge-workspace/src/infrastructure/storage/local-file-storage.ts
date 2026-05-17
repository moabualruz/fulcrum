import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_STORAGE_ROOT = process.env["FULCRUM_ATTACHMENT_STORAGE"] ??
  join(process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "/tmp", ".fulcrum"), "attachments");

export interface StoredFile {
  storagePath: string;
  checksumSha256: string;
  sizeBytes: number;
}

export async function storeFile(
  buffer: Buffer,
  fileName: string,
  orgId: string,
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<StoredFile> {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const subdir = join(orgId, hash.slice(0, 2));
  const fullDir = join(storageRoot, subdir);
  await mkdir(fullDir, { recursive: true });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = join(subdir, `${hash.slice(0, 16)}_${safeName}`);
  const fullPath = join(storageRoot, storagePath);
  await writeFile(fullPath, buffer);

  return { storagePath, checksumSha256: hash, sizeBytes: buffer.length };
}

export async function retrieveFile(
  storagePath: string,
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<Buffer> {
  return readFile(join(storageRoot, storagePath));
}

export async function deleteFile(
  storagePath: string,
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<void> {
  await unlink(join(storageRoot, storagePath)).catch(() => {});
}

export async function fileExists(
  storagePath: string,
  storageRoot = DEFAULT_STORAGE_ROOT,
): Promise<boolean> {
  try {
    await stat(join(storageRoot, storagePath));
    return true;
  } catch {
    return false;
  }
}
