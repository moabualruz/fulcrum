import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubIssuesConnectorOptions {
  token?: string;
  repo?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class GitHubIssuesConnector implements ConnectorAdapter {
  readonly kind = "github-issues";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly token: string;
  private readonly repo: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: GitHubIssuesConnectorOptions = {}) {
    this.token = options.token ?? process.env.GITHUB_TOKEN ?? "";
    this.repo = options.repo ?? process.env.GITHUB_REPO ?? "";
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
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

    const response = await this.request(`/repos/${this.repo}/issues`);
    if (!response.ok) return syncError(response, "github_issues_pull_failed");

    const body = (await response.json()) as GitHubIssue[];
    const items = body.map(mapGitHubIssue);
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    const errors = [];
    let pushed = 0;
    for (const item of items) {
      const response = await this.request(`/repos/${this.repo}/issues/${encodeURIComponent(item.externalId)}`, {
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
      const response = await this.request("/user");
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

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        ...init.headers,
      },
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new Error(`connector disabled: ${connectorFlag(this.kind)}`);
  }
}

interface GitHubIssue {
  id?: number;
  number?: number;
  title?: string;
  state?: string;
  assignees?: Array<{ login?: string }>;
  labels?: Array<string | { name?: string }>;
}

function mapGitHubIssue(issue: GitHubIssue): SyncItem {
  const issueNumber = issue.number ?? issue.id ?? 0;
  return {
    externalId: String(issueNumber),
    data: {
      id: issue.id,
      title: issue.title,
      status: mapGitHubStatus(issue.state),
      assignee: issue.assignees?.[0]?.login,
      labels: mapGitHubLabels(issue.labels),
      metadata_json: { external_id: issueNumber },
    },
  };
}

function githubIssueUpdatePayload(item: SyncItem): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (typeof item.data.title === "string") payload.title = item.data.title;
  if (typeof item.data.status === "string") payload.state = githubIssueState(item.data.status);
  if (Array.isArray(item.data.labels)) payload.labels = item.data.labels.filter((label) => typeof label === "string");
  return payload;
}

function mapGitHubStatus(status?: string): string {
  if (status === "closed") return "done";
  return "todo";
}

function githubIssueState(status: string): string {
  if (status === "done") return "closed";
  return "open";
}

function mapGitHubLabels(labels?: Array<string | { name?: string }>): string[] {
  return labels
    ?.map((label) => (typeof label === "string" ? label : label.name))
    .filter((name) => typeof name === "string") ?? [];
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}
