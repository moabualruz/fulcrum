// Linear importer — gated behind FULCRUM_FEATURES=import-linear.
// Uses mocked or real HTTP client; API key from CredentialRepository.

import { assertFeatureEnabled } from "@integration-hub/application/data-exchange/features.ts";
import { mapLinearIssue, type LinearIssue } from "./linear.fieldmap.ts";
import type { CredentialRepository, HttpClient, ImportOptions, ImportResult } from "./types.ts";

const LINEAR_API_URL = "https://api.linear.app/graphql";

const ISSUES_QUERY = `
  query IssueConnection($teamId: String!) {
    issues(filter: { team: { id: { eq: $teamId } } }) {
      nodes {
        id
        title
        description
        state { name }
        priority
        assignee { name }
        labels { nodes { name } }
        dueDate
      }
    }
  }
`;

interface LinearResponse {
  data?: {
    issues?: {
      nodes?: LinearIssue[];
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Retry with exponential backoff on 429 / network errors.
 * max 3 attempts.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
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

export async function importFromLinear(
  teamId: string,
  credentials: CredentialRepository,
  http: HttpClient,
  options: ImportOptions = {},
): Promise<ImportResult> {
  assertFeatureEnabled("import-linear");

  const apiKey = await credentials.get("LINEAR_API_KEY");
  if (!apiKey) {
    throw new Error("Credential 'LINEAR_API_KEY' not found; run: fulcrum secrets set LINEAR_API_KEY");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: apiKey,
  };

  const raw = await withRetry(() =>
    http.post(LINEAR_API_URL, headers, {
      query: ISSUES_QUERY,
      variables: { teamId },
    })
  ) as LinearResponse;

  if (raw.errors?.length) {
    throw new Error(`Linear API error: ${raw.errors.map((e) => e.message).join("; ")}`);
  }

  const issues = raw.data?.issues?.nodes ?? [];
  const errors: string[] = [];
  const tasks = [];

  for (const issue of issues) {
    try {
      tasks.push(mapLinearIssue(issue));
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
