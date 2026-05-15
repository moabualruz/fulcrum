/**
 * Linear importer — gated by `import-linear` feature flag.
 *
 * Fetches issues via Linear GraphQL IssueConnection query.
 * API key from CredentialRepository via credentials.get('LINEAR_API_KEY').
 *
 * Pillar 17 issue 15. C1: OFF by default.
 */

import type { CredentialReader, HttpClient, ImportOptions, ImportResult, Importer } from "./types.ts";
import { mapLinearIssue, type LinearIssue } from "./linear.fieldmap.ts";
import { withRetry, HttpError } from "./retry.ts";

const LINEAR_API = "https://api.linear.app/graphql";

const ISSUES_QUERY = `
  query Issues($projectId: String!, $after: String) {
    issues(filter: { project: { id: { eq: $projectId } } }, first: 50, after: $after) {
      nodes {
        id title description
        state { name }
        priority
        assignee { name email }
        labels { nodes { name } }
        dueDate
        estimate
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface GraphQLResponse {
  data?: {
    issues: {
      nodes: LinearIssue[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
}

export class LinearImporter implements Importer {
  readonly name = "linear";
  readonly featureFlag = "import-linear";

  constructor(
    private readonly credentials: CredentialReader,
    private readonly http: HttpClient,
  ) {}

  async import(options: ImportOptions): Promise<ImportResult> {
    const apiKey = await this.credentials.get("LINEAR_API_KEY");

    const allIssues: LinearIssue[] = [];
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const resp = await withRetry(() =>
        this.http.request<GraphQLResponse>(LINEAR_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiKey,
          },
          body: JSON.stringify({
            query: ISSUES_QUERY,
            variables: { projectId: options.projectId, after },
          }),
        }),
      );

      if (resp.status >= 400) {
        throw new HttpError(resp.status, `Linear API error: ${resp.status}`);
      }

      const gql = resp.data;
      const firstError = gql.errors?.[0];
      if (firstError) {
        throw new Error(`Linear GraphQL error: ${firstError.message}`);
      }

      const issues = gql.data?.issues;
      if (!issues) break;

      allIssues.push(...issues.nodes);
      hasNextPage = issues.pageInfo.hasNextPage;
      after = issues.pageInfo.endCursor;
    }

    const tasks = allIssues.map(mapLinearIssue);

    if (options.dryRun) {
      return { imported: 0, skipped: 0, errors: 0, tasks };
    }

    return { imported: tasks.length, skipped: 0, errors: 0, tasks };
  }
}
