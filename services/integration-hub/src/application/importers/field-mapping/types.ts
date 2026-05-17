/**
 * Shared types for gated importers (Linear, Jira, Plane).
 *
 * Pillar 17 issue 15. C1: each importer gated by feature flag.
 * C4: importers usable from CLI, tRPC, and TUI surfaces.
 */

/** Fulcrum-canonical task shape produced by every importer field map. */
export interface ImportedTask {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  dueDate: string | null;
  estimate: number | null;
  customFields: Record<string, unknown>;
}

/** Result of an import run. */
export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  tasks: ImportedTask[];
}

/** Options for import run. */
export interface ImportOptions {
  projectId: string;
  dryRun: boolean;
  json: boolean;
}

/** Credential reader interface — decoupled from CredentialRepository for testability. */
export interface CredentialReader {
  get(name: string): Promise<string>;
}

/** HTTP client interface — decoupled for mocking. */
export interface HttpClient {
  request<T>(url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }): Promise<{ status: number; data: T; headers: Record<string, string> }>;
}

/** Base importer interface all three implement. */
export interface Importer {
  readonly name: string;
  readonly featureFlag: string;
  import(options: ImportOptions): Promise<ImportResult>;
}

/** Retry/backoff config for connector framework integration. */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};
