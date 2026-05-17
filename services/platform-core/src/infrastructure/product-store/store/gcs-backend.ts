/**
 * GcsBackend: StorageBackend using @google-cloud/storage.
 * Retries 3× on network errors.
 */

import type { StorageBackend } from "./storage.ts";

interface BucketLike {
  file(name: string): {
    save(data: Buffer): Promise<unknown>;
    download(): Promise<[Buffer]>;
    delete(): Promise<unknown>;
    exists(): Promise<[boolean]>;
  };
}

export interface GcsConfig {
  bucket: string;
  keyFile: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

function isRetryable(err: any): boolean {
  const msg = err?.message ?? "";
  return (
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("NetworkError")
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
    }
  }
  throw lastErr;
}

export class GcsBackend implements StorageBackend {
  readonly name = "gcs";
  private readonly bucket: BucketLike;

  private constructor(bucket: BucketLike) {
    this.bucket = bucket;
  }

  static async fromConfig(config: GcsConfig): Promise<GcsBackend> {
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage({ keyFilename: config.keyFile });
    const bucket = storage.bucket(config.bucket);
    return new GcsBackend(bucket as unknown as BucketLike);
  }

  static fromMockBucket(bucket: BucketLike): GcsBackend {
    return new GcsBackend(bucket);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.bucket.file(key);
    await withRetry(() => file.save(data));
  }

  async get(key: string): Promise<Buffer> {
    const file = this.bucket.file(key);
    const [buf] = await withRetry(() => file.download());
    return buf;
  }

  async delete(key: string): Promise<void> {
    const file = this.bucket.file(key);
    try {
      await withRetry(() => file.delete());
    } catch (err: any) {
      if (err?.code !== 404 && !err?.message?.includes("NotFound")) throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const file = this.bucket.file(key);
    const [exists] = await withRetry(() => file.exists());
    return exists;
  }
}
