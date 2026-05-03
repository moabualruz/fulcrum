/**
 * AzureBackend: StorageBackend using @azure/storage-blob.
 * Retries 3× on network errors.
 */

import type { StorageBackend } from "./storage.ts";

interface ContainerClientLike {
  getBlockBlobClient(blobName: string): {
    upload(data: Buffer, size: number): Promise<unknown>;
    downloadToBuffer(): Promise<Buffer>;
    delete(): Promise<unknown>;
    exists(): Promise<boolean>;
  };
}

export interface AzureConfig {
  connectionString: string;
  container: string;
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

export class AzureBackend implements StorageBackend {
  readonly name = "azure";
  private readonly container: ContainerClientLike;

  private constructor(container: ContainerClientLike) {
    this.container = container;
  }

  static async fromConfig(config: AzureConfig): Promise<AzureBackend> {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    const service = BlobServiceClient.fromConnectionString(config.connectionString);
    const container = service.getContainerClient(config.container);
    return new AzureBackend(container as unknown as ContainerClientLike);
  }

  static fromMockClient(container: ContainerClientLike): AzureBackend {
    return new AzureBackend(container);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const blob = this.container.getBlockBlobClient(key);
    await withRetry(() => blob.upload(data, data.length));
  }

  async get(key: string): Promise<Buffer> {
    const blob = this.container.getBlockBlobClient(key);
    return withRetry(() => blob.downloadToBuffer());
  }

  async delete(key: string): Promise<void> {
    const blob = this.container.getBlockBlobClient(key);
    try {
      await withRetry(() => blob.delete());
    } catch (err: any) {
      if (err?.statusCode !== 404 && !err?.message?.includes("BlobNotFound")) throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const blob = this.container.getBlockBlobClient(key);
    return withRetry(() => blob.exists());
  }
}
