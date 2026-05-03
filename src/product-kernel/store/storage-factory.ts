/**
 * createStorageBackend(flags, localRoot, cloudConfig?)
 *
 * Returns the correct StorageBackend based on enabled feature flags.
 * Priority: s3 > azure > gcs > local-fs.
 * Only one cloud backend active at a time (first enabled wins).
 */

import { LocalFsBackend, type StorageBackend } from "./storage.ts";
import { S3Backend, type S3Config } from "./s3-backend.ts";
import { AzureBackend, type AzureConfig } from "./azure-backend.ts";
import { GcsBackend, type GcsConfig } from "./gcs-backend.ts";

export interface CloudConfigs {
  s3?: S3Config;
  azure?: AzureConfig;
  gcs?: GcsConfig;
}

export type FeatureFlags = Record<string, boolean>;

/**
 * Factory: returns StorageBackend matching first enabled flag.
 * Synchronous for local-fs; cloud backends constructed eagerly with config
 * (actual SDK client created lazily on first operation via async fromConfig,
 * but factory returns a synchronous wrapper that triggers async init on first call).
 *
 * For simplicity, cloud backends are constructed synchronously here using
 * their fromMockClient/fromMockBucket with a lazy-init proxy pattern:
 * the real SDK client is created on first put/get/delete/exists call.
 */
export function createStorageBackend(
  flags: FeatureFlags,
  localRoot: string,
  configs?: CloudConfigs,
): StorageBackend {
  // Priority: s3 > azure > gcs
  if (flags["external-storage-s3"]) {
    if (!configs?.s3) throw new Error("S3 config required when external-storage-s3 flag is enabled");
    return makeLazyS3(configs.s3);
  }

  if (flags["external-storage-azure"]) {
    if (!configs?.azure) throw new Error("Azure config required when external-storage-azure flag is enabled");
    return makeLazyAzure(configs.azure);
  }

  if (flags["external-storage-gcs"]) {
    if (!configs?.gcs) throw new Error("GCS config required when external-storage-gcs flag is enabled");
    return makeLazyGcs(configs.gcs);
  }

  return new LocalFsBackend(localRoot);
}

// Lazy proxy: backend initialized on first operation, not at factory time.
// Why: SDK imports are heavy; avoid importing @aws-sdk if never called.

function makeLazyS3(config: S3Config): StorageBackend {
  let real: S3Backend | null = null;
  const init = async () => {
    if (!real) real = await S3Backend.fromConfig(config);
    return real;
  };
  return {
    name: "s3",
    put: async (k, d) => (await init()).put(k, d),
    get: async (k) => (await init()).get(k),
    delete: async (k) => (await init()).delete(k),
    exists: async (k) => (await init()).exists(k),
  };
}

function makeLazyAzure(config: AzureConfig): StorageBackend {
  let real: AzureBackend | null = null;
  const init = async () => {
    if (!real) real = await AzureBackend.fromConfig(config);
    return real;
  };
  return {
    name: "azure",
    put: async (k, d) => (await init()).put(k, d),
    get: async (k) => (await init()).get(k),
    delete: async (k) => (await init()).delete(k),
    exists: async (k) => (await init()).exists(k),
  };
}

function makeLazyGcs(config: GcsConfig): StorageBackend {
  let real: GcsBackend | null = null;
  const init = async () => {
    if (!real) real = await GcsBackend.fromConfig(config);
    return real;
  };
  return {
    name: "gcs",
    put: async (k, d) => (await init()).put(k, d),
    get: async (k) => (await init()).get(k),
    delete: async (k) => (await init()).delete(k),
    exists: async (k) => (await init()).exists(k),
  };
}
