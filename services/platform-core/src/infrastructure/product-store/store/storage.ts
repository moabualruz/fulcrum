/**
 * StorageBackend interface: abstract put/get/delete/exists for artifact storage.
 * LocalFsBackend is always-on; cloud backends implement same interface.
 */

import { mkdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface StorageBackend {
  /** Backend identifier: 'local-fs' | 's3' | 'azure' | 'gcs' */
  readonly name: string;
  /** Store data at key (relative path). Creates parent dirs as needed. */
  put(key: string, data: Buffer): Promise<void>;
  /** Retrieve data by key. Throws if not found. */
  get(key: string): Promise<Buffer>;
  /** Delete data at key. Idempotent — no throw if missing. */
  delete(key: string): Promise<void>;
  /** Check if key exists. */
  exists(key: string): Promise<boolean>;
}

export class LocalFsBackend implements StorageBackend {
  readonly name = "local-fs";

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    return join(this.root, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
