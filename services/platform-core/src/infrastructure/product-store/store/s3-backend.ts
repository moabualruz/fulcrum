/**
 * S3Backend: StorageBackend implementation using @aws-sdk/client-s3.
 * Compatible with MinIO, R2, B2 via endpoint override.
 * Retries 3× on network errors with exponential backoff.
 */

import type { StorageBackend } from "./storage.ts";

interface S3ClientLike {
  send(command: any): Promise<any>;
}

interface CommandFactory {
  putObject(input: { Bucket: string; Key: string; Body: Buffer }): any;
  getObject(input: { Bucket: string; Key: string }): any;
  deleteObject(input: { Bucket: string; Key: string }): any;
  headObject(input: { Bucket: string; Key: string }): any;
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

function isRetryable(err: any): boolean {
  const name = err?.name ?? "";
  const msg = err?.message ?? "";
  return (
    name === "NetworkingError" ||
    name === "TimeoutError" ||
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

/** Plain-object commands for mock clients (no SDK import needed). */
function makePlainCommands(): CommandFactory {
  const make = (name: string) =>
    class {
      static { Object.defineProperty(this, "name", { value: name }); }
      input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) { this.input = input; }
    };
  const Put = make("PutObjectCommand");
  const Get = make("GetObjectCommand");
  const Del = make("DeleteObjectCommand");
  const Head = make("HeadObjectCommand");
  return {
    putObject: (i) => new Put(i),
    getObject: (i) => new Get(i),
    deleteObject: (i) => new Del(i),
    headObject: (i) => new Head(i),
  };
}

export class S3Backend implements StorageBackend {
  readonly name = "s3";
  private readonly client: S3ClientLike;
  private readonly bucket: string;
  private readonly cmds: CommandFactory;

  private constructor(client: S3ClientLike, bucket: string, cmds: CommandFactory) {
    this.client = client;
    this.bucket = bucket;
    this.cmds = cmds;
  }

  /** Create from env config. Lazy-imports @aws-sdk/client-s3. */
  static async fromConfig(config: S3Config): Promise<S3Backend> {
    const sdk = await import("@aws-sdk/client-s3");
    const client = new sdk.S3Client({
      endpoint: config.endpoint,
      region: config.region ?? "us-east-1",
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      forcePathStyle: true,
    });
    const cmds: CommandFactory = {
      putObject: (i) => new sdk.PutObjectCommand(i),
      getObject: (i) => new sdk.GetObjectCommand(i),
      deleteObject: (i) => new sdk.DeleteObjectCommand(i),
      headObject: (i) => new sdk.HeadObjectCommand(i),
    };
    return new S3Backend(client, config.bucket, cmds);
  }

  /** For testing with a mock client (no SDK import). */
  static fromMockClient(client: S3ClientLike, bucket: string): S3Backend {
    return new S3Backend(client, bucket, makePlainCommands());
  }

  async put(key: string, data: Buffer): Promise<void> {
    await withRetry(() =>
      this.client.send(this.cmds.putObject({ Bucket: this.bucket, Key: key, Body: data })),
    );
  }

  async get(key: string): Promise<Buffer> {
    const resp = await withRetry(() =>
      this.client.send(this.cmds.getObject({ Bucket: this.bucket, Key: key })),
    );
    const bytes = await resp.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await withRetry(() =>
      this.client.send(this.cmds.deleteObject({ Bucket: this.bucket, Key: key })),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await withRetry(() =>
        this.client.send(this.cmds.headObject({ Bucket: this.bucket, Key: key })),
      );
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }
}
