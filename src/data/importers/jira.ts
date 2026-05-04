// Jira importer — gated behind FULCRUM_FEATURES=import-jira.
// Uses Jira REST API v3; credentials from CredentialRepository.

import { assertFeatureEnabled } from "../features.ts";
import { mapJiraIssue, type JiraIssue } from "./jira.fieldmap.ts";
import type { CredentialRepository, HttpClient, ImportOptions, ImportResult } from "./types.ts";

interface JiraSearchResponse {
  issues?: JiraIssue[];
  total?: number;
  errorMessages?: string[];
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

export async function importFromJira(
  projectKey: string,
  credentials: CredentialRepository,
  http: HttpClient,
  options: ImportOptions = {},
): Promise<ImportResult> {
  assertFeatureEnabled("import-jira");

  const host = await credentials.get("JIRA_HOST");
  if (!host) {
    throw new Error("Credential 'JIRA_HOST' not found; run: fulcrum secrets set JIRA_HOST");
  }
  const email = await credentials.get("JIRA_EMAIL");
  if (!email) {
    throw new Error("Credential 'JIRA_EMAIL' not found; run: fulcrum secrets set JIRA_EMAIL");
  }
  const token = await credentials.get("JIRA_API_TOKEN");
  if (!token) {
    throw new Error("Credential 'JIRA_API_TOKEN' not found; run: fulcrum secrets set JIRA_API_TOKEN");
  }

  const basicAuth = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Basic ${basicAuth}`,
  };

  const url = `${host}/rest/api/3/search?jql=project=${encodeURIComponent(projectKey)}&maxResults=100`;

  const raw = await withRetry(() => http.get(url, headers)) as JiraSearchResponse;

  if (raw.errorMessages?.length) {
    throw new Error(`Jira API error: ${raw.errorMessages.join("; ")}`);
  }

  const issues = raw.issues ?? [];
  const errors: string[] = [];
  const tasks = [];

  for (const issue of issues) {
    try {
      tasks.push(mapJiraIssue(issue));
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
