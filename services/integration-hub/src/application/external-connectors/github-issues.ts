/**
 * GitHub Issues connector — one-way pull via GitHub REST API.
 *
 * Feature flag: `connector-github-issues`
 * Env: GITHUB_TOKEN, GITHUB_REPO (owner/repo)
 */

import { ConnectorBase, mapGitHubStatus, type UpsertTaskInput } from "./framework.ts";
import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

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
  id?: number;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels?: GitHubLabel[];
  milestone?: GitHubMilestone | null;
  assignees?: GitHubUser[];
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

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubIssuesConnectorOptions {
  token?: string;
  repo?: string;
  fetch?: ConnectorFetch;
  fetchFn?: typeof globalThis.fetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class GitHubIssuesConnector extends ConnectorBase implements ConnectorAdapter {
  readonly name = "github-issues";
  readonly flag = "connector-github-issues";
  readonly kind = "github-issues";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly token: string;
  private readonly repo: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(opts: GitHubIssuesConnectorOptions = {}) {
    super();
    this.token = opts?.token ?? process.env["GITHUB_TOKEN"] ?? "";
    this.repo = opts?.repo ?? process.env["GITHUB_REPO"] ?? "";
    this.fetchImpl = opts.fetch ?? opts.fetchFn ?? ((input, init) => fetch(input, init));
  }

  enable(): void {
    this.enabled = true;
  }

  async connect(): Promise<void> {
    this.assertEnabled();
  }

  async disconnect(): Promise<void> {}

  async pull(): Promise<SyncResult> {
    this.assertEnabled();
    const response = await this.request("/issues");
    if (!response.ok) return syncError(response, "github_issues_pull_failed");

    const issues = (await response.json()) as GitHubIssue[];
    const items = issues.filter((issue) => !isPullRequest(issue)).map(mapGitHubIssue);
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    const errors = [];
    let pushed = 0;
    for (const item of items) {
      const issueNumber = stripExternalIdPrefix(item.externalId);
      const response = await this.request(`/issues/${encodeURIComponent(issueNumber)}`, {
        method: "PATCH",
        body: JSON.stringify(githubIssueUpdatePayload(item)),
      });
      if (response.ok) {
        pushed += 1;
      } else {
        errors.push({
          externalId: item.externalId,
          message: response.statusText,
          code: "github_issues_push_failed",
        });
      }
    }

    return { pulled: 0, pushed, skipped: 0, errors };
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    this.assertEnabled();

    try {
      const response = await this.request("");
      if (response.status === 401 || response.status === 403) {
        return { ok: false, status: "auth_failed", message: "auth_failed", checkedAt: new Date() };
      }
      return {
        ok: response.ok,
        status: response.ok ? "ok" : "unreachable",
        message: response.ok ? undefined : response.statusText,
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        ok: false,
        status: "unreachable",
        message: error instanceof Error ? error.message : "unreachable",
        checkedAt: new Date(),
      };
    }
  }

  async fetch(): Promise<UpsertTaskInput[]> {
    if (!this.token) throw new Error("GITHUB_TOKEN is required");
    if (!this.repo) throw new Error("GITHUB_REPO is required (owner/repo)");

    const items: UpsertTaskInput[] = [];
    let url: string | null =
      `https://api.github.com/repos/${this.repo}/issues?state=all&per_page=100`;

    while (url) {
      const res = await this.fetchImpl(String(url), {
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
        if (isPullRequest(issue)) continue;

        const input: UpsertTaskInput = {
          external_id: `github:${issue.number}`,
          title: issue.title,
          description: issue.body,
          status: mapGitHubStatus(issue.state),
          labels: issue.labels?.map((l) => l.name) ?? [],
          assignee: issue.assignees?.[0]?.login ?? null,
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

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new Error(`connector disabled: ${connectorFlag(this.kind)}`);
  }
}

function mapGitHubIssue(issue: GitHubIssue): SyncItem {
  return {
    externalId: String(issue.number),
    data: {
      id: issue.id,
      title: issue.title,
      status: mapGitHubIssueStatus(issue.state),
      assignee: issue.assignees?.[0]?.login,
      labels: issue.labels?.map((label) => label.name) ?? [],
      metadata_json: { external_id: issue.number },
    },
  };
}

function githubIssueUpdatePayload(item: SyncItem): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (typeof item.data.title === "string") payload.title = item.data.title;
  if (typeof item.data.status === "string") payload.state = githubIssueState(item.data.status);
  if (Array.isArray(item.data.labels)) payload.labels = item.data.labels;
  return payload;
}

function mapGitHubIssueStatus(state?: string): string {
  return state === "closed" ? "done" : "todo";
}

function githubIssueState(status: string): string {
  if (status === "done" || status === "completed" || status === "closed") return "closed";
  return "open";
}

function isPullRequest(issue: GitHubIssue): boolean {
  return Boolean((issue as unknown as Record<string, unknown>)["pull_request"]);
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}

function stripExternalIdPrefix(externalId: string): string {
  return externalId.startsWith("github:") ? externalId.slice("github:".length) : externalId;
}
