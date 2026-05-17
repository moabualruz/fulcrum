import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitLabConnectorOptions {
  token?: string;
  url?: string;
  projectId?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class GitLabConnector implements ConnectorAdapter {
  readonly kind = "gitlab";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly projectId: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: GitLabConnectorOptions = {}) {
    this.token = options.token ?? process.env.GITLAB_TOKEN ?? "";
    this.baseUrl = normalizeBaseUrl(options.url ?? process.env.GITLAB_URL ?? "https://gitlab.com");
    this.projectId = options.projectId ?? process.env.GITLAB_PROJECT_ID ?? "";
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

    const [branchesResponse, commitsResponse, mergeRequestsResponse] = await Promise.all([
      this.request(`/projects/${encodeURIComponent(this.projectId)}/repository/branches`),
      this.request(`/projects/${encodeURIComponent(this.projectId)}/repository/commits?per_page=20`),
      this.request(`/projects/${encodeURIComponent(this.projectId)}/merge_requests?state=opened`),
    ]);

    const failed = [branchesResponse, commitsResponse, mergeRequestsResponse].find((response) => !response.ok);
    if (failed) return syncError(failed, "gitlab_pull_failed");

    const branches = ((await branchesResponse.json()) as GitLabBranch[]).map(mapGitLabBranch);
    const commits = ((await commitsResponse.json()) as GitLabCommit[]).map(mapGitLabCommit);
    const mergeRequests = ((await mergeRequestsResponse.json()) as GitLabMergeRequest[]).map(mapGitLabMergeRequest);
    const items = [...branches, ...commits, ...mergeRequests];
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();
    return { pulled: 0, pushed: 0, skipped: items.length, errors: [] };
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
    return this.fetchImpl(`${this.baseUrl}/api/v4${path}`, {
      ...init,
      headers: {
        "private-token": this.token,
        accept: "application/json",
        "content-type": "application/json",
        ...init.headers,
      },
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new Error(`connector disabled: ${connectorFlag(this.kind)}`);
  }
}

interface GitLabBranch {
  name?: string;
  default?: boolean;
  commit?: { id?: string };
}

interface GitLabCommit {
  id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  committed_date?: string;
}

interface GitLabMergeRequest {
  iid?: number;
  title?: string;
  state?: string;
  source_branch?: string;
  target_branch?: string;
  web_url?: string;
}

function mapGitLabBranch(branch: GitLabBranch): SyncItem {
  const name = branch.name ?? "";
  return {
    externalId: `branch:${name}`,
    data: {
      kind: "branch",
      name,
      sha: branch.commit?.id,
      isDefault: branch.default === true,
    },
  };
}

function mapGitLabCommit(commit: GitLabCommit): SyncItem {
  const sha = commit.id ?? "";
  return {
    externalId: `commit:${sha}`,
    data: {
      kind: "commit",
      sha,
      message: commit.message ?? commit.title,
      author: commit.author_name,
      committedAt: commit.committed_date,
    },
  };
}

function mapGitLabMergeRequest(mergeRequest: GitLabMergeRequest): SyncItem {
  const number = mergeRequest.iid ?? 0;
  return {
    externalId: `pr:${number}`,
    data: {
      kind: "pull_request",
      number,
      title: mergeRequest.title,
      state: mergeRequest.state,
      sourceBranch: mergeRequest.source_branch,
      targetBranch: mergeRequest.target_branch,
      url: mergeRequest.web_url,
    },
  };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}
