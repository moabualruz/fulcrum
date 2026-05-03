/**
 * GitHub Issues connector — one-way pull via GitHub REST API.
 *
 * Feature flag: `connector-github-issues`
 * Env: GITHUB_TOKEN, GITHUB_REPO (owner/repo)
 */

import { ConnectorBase, mapGitHubStatus, type UpsertTaskInput } from "./framework.ts";

// ---------------------------------------------------------------------------
// GitHub REST API types (subset)
// ---------------------------------------------------------------------------

interface GitHubLabel {
  name: string;
  color?: string;
}

interface GitHubMilestone {
  number: number;
  title: string;
  created_at: string;
  due_on: string | null;
}

interface GitHubUser {
  login: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: GitHubLabel[];
  milestone: GitHubMilestone | null;
  assignees: GitHubUser[];
}

// ---------------------------------------------------------------------------
// Link header pagination parser
// ---------------------------------------------------------------------------

export function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1] as string;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GitHubIssuesConnector
// ---------------------------------------------------------------------------

export class GitHubIssuesConnector extends ConnectorBase {
  readonly name = "github-issues";
  readonly flag = "connector-github-issues";

  private token: string;
  private repo: string;
  private fetchFn: typeof globalThis.fetch;

  constructor(opts?: { token?: string; repo?: string; fetchFn?: typeof globalThis.fetch }) {
    super();
    this.token = opts?.token ?? process.env["GITHUB_TOKEN"] ?? "";
    this.repo = opts?.repo ?? process.env["GITHUB_REPO"] ?? "";
    this.fetchFn = opts?.fetchFn ?? globalThis.fetch;
  }

  async fetch(): Promise<UpsertTaskInput[]> {
    if (!this.token) throw new Error("GITHUB_TOKEN is required");
    if (!this.repo) throw new Error("GITHUB_REPO is required (owner/repo)");

    const items: UpsertTaskInput[] = [];
    let url: string | null =
      `https://api.github.com/repos/${this.repo}/issues?state=all&per_page=100`;

    while (url) {
      const res = await this.fetchFn(String(url), {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!res.ok) {
        throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
      }

      const issues: GitHubIssue[] = (await res.json()) as GitHubIssue[];

      for (const issue of issues) {
        // Skip pull requests (they come back from the issues endpoint).
        if ((issue as unknown as Record<string, unknown>)["pull_request"]) continue;

        const input: UpsertTaskInput = {
          external_id: `github:${issue.number}`,
          title: issue.title,
          description: issue.body,
          status: mapGitHubStatus(issue.state),
          labels: issue.labels.map((l) => l.name),
          assignee: issue.assignees[0]?.login ?? null,
        };

        if (issue.milestone) {
          input.sprint_external_id = `github:milestone:${issue.milestone.number}`;
          input.sprint_title = issue.milestone.title;
          input.sprint_start_date = issue.milestone.created_at;
          input.sprint_end_date = issue.milestone.due_on;
        }

        items.push(input);
      }

      url = parseLinkHeader(res.headers.get("link"));
    }

    return items;
  }
}
