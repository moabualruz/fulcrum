// Plane importer — gated behind FULCRUM_FEATURES=import-plane.
// Plane API v1; token from CredentialRepository.

import { assertFeatureEnabled } from "../features.ts";
import { mapPlaneIssue, type PlaneIssue } from "./plane.fieldmap.ts";
import type { CredentialRepository, HttpClient, ImportOptions, ImportResult } from "./types.ts";

interface PlaneIssuesResponse {
  results?: PlaneIssue[];
  error?: string;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = String(err);
      if (msg.includes("429") || msg.includes("network") || msg.includes("timeout")) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function importFromPlane(
  workspaceSlug: string,
  projectId: string,
  credentials: CredentialRepository,
  http: HttpClient,
  options: ImportOptions = {},
): Promise<ImportResult> {
  assertFeatureEnabled("import-plane");

  const token = await credentials.get("PLANE_API_TOKEN");
  if (!token) {
    throw new Error("Credential 'PLANE_API_TOKEN' not found; run: fulcrum secrets set PLANE_API_TOKEN");
  }

  const host = (await credentials.get("PLANE_HOST")) ?? "https://api.plane.so";
  const url = `${host}/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-token": token,
  };

  const raw = await withRetry(() => http.get(url, headers)) as PlaneIssuesResponse;

  if (raw.error) {
    throw new Error(`Plane API error: ${raw.error}`);
  }

  const issues = raw.results ?? [];
  const errors: string[] = [];
  const tasks = [];

  for (const issue of issues) {
    try {
      tasks.push(mapPlaneIssue(issue));
    } catch (err) {
      errors.push(`issue ${issue.id}: ${String(err)}`);
    }
  }

  return {
    imported: options.dryRun ? 0 : tasks.length,
    skipped: 0,
    errors,
  };
}
