/**
 * PM tool import helpers: shared between CLI and tests.
 * Contains runImport, formatImportResult, NullCredentialRepository, FetchHttpClient.
 */

import {
  importProjectSource,
  type CredentialRepository,
  type HttpClient,
  type SourceImportResult as ImportResult,
} from "@integration-hub/interface/project-importers.ts";

export type { CredentialRepository, HttpClient, ImportResult };

export interface ImportRunOptions {
  format: string;
  project: string;
  dryRun: boolean;
  json: boolean;
  credentials: CredentialRepository;
  http: HttpClient;
  /** For Plane: workspace slug */
  workspace?: string;
}

export async function runImport(opts: ImportRunOptions): Promise<ImportResult> {
  const { format, project, dryRun, credentials, http, workspace } = opts;
  return importProjectSource({ format, project, dryRun, credentials, http, workspace });
}

export function formatImportResult(result: ImportResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);
  const lines = [
    `imported: ${result.imported}`,
    `skipped: ${result.skipped}`,
    `errors: ${result.errors.length}`,
  ];
  if (result.errors.length > 0) {
    lines.push(...result.errors.map((e) => `  error: ${e}`));
  }
  return lines.join("\n");
}

/** Credential repository that always returns null: used in CLI when no real keystore configured. */
export class NullCredentialRepository implements CredentialRepository {
  async get(_key: string): Promise<string | null> {
    return null;
  }
}

/** Fetch-based HTTP client. */
export class FetchHttpClient implements HttpClient {
  async get(url: string, headers: Record<string, string>): Promise<unknown> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} GET ${url}`);
    }
    return res.json();
  }

  async post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} POST ${url}`);
    }
    return res.json();
  }
}
