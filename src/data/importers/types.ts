// Shared types for all PM tool importers.

export interface FulcrumTask {
  title: string;
  description: string;
  status: string;
  priority: number;
  assignee: string | null;
  labels: string[];
  due_date: string | null;
  estimate: number | null;
  custom_fields: Record<string, string>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ImportOptions {
  dryRun?: boolean;
  json?: boolean;
}

/** Minimal credential repository interface — mirrors real CredentialRepository. */
export interface CredentialRepository {
  get(key: string): Promise<string | null>;
}

/** HTTP client interface — mockable in tests. */
export interface HttpClient {
  get(url: string, headers: Record<string, string>): Promise<unknown>;
  post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown>;
}
