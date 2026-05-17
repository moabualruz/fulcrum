import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface BitbucketConnectorOptions {
  token?: string;
  workspace?: string;
  repoSlug?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class BitbucketConnector implements ConnectorAdapter {
  readonly kind = "bitbucket";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly token: string;
  private readonly workspace: string;
  private readonly repoSlug: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: BitbucketConnectorOptions = {}) {
    this.token = options.token ?? process.env.BITBUCKET_TOKEN ?? "";
    this.workspace = options.workspace ?? process.env.BITBUCKET_WORKSPACE ?? "";
    this.repoSlug = options.repoSlug ?? process.env.BITBUCKET_REPO_SLUG ?? "";
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

    const [branchesResponse, commitsResponse, pullRequestsResponse] = await Promise.all([
      this.request("/refs/branches"),
      this.request("/commits?pagelen=20"),
      this.request("/pullrequests?state=OPEN"),
    ]);

    const failed = [branchesResponse, commitsResponse, pullRequestsResponse].find((response) => !response.ok);
    if (failed) return syncError(failed, "bitbucket_pull_failed");

    const branchesBody = (await branchesResponse.json()) as BitbucketList<BitbucketBranch>;
    const commitsBody = (await commitsResponse.json()) as BitbucketList<BitbucketCommit>;
    const pullRequestsBody = (await pullRequestsResponse.json()) as BitbucketList<BitbucketPullRequest>;
    const items = [
      ...branchesBody.values.map(mapBitbucketBranch),
      ...commitsBody.values.map(mapBitbucketCommit),
      ...pullRequestsBody.values.map(mapBitbucketPullRequest),
    ];
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

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(`https://api.bitbucket.org/2.0/repositories/${this.workspace}/${this.repoSlug}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
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

interface BitbucketList<T> {
  values: T[];
}

interface BitbucketBranch {
  name?: string;
  target?: { hash?: string };
  mainbranch?: boolean;
}

interface BitbucketCommit {
  hash?: string;
  message?: string;
  author?: { raw?: string };
  date?: string;
}

interface BitbucketPullRequest {
  id?: number;
  title?: string;
  state?: string;
  source?: { branch?: { name?: string } };
  destination?: { branch?: { name?: string } };
  links?: { html?: { href?: string } };
}

function mapBitbucketBranch(branch: BitbucketBranch): SyncItem {
  const name = branch.name ?? "";
  return {
    externalId: `branch:${name}`,
    data: {
      kind: "branch",
      name,
      sha: branch.target?.hash,
      isDefault: branch.mainbranch === true,
    },
  };
}

function mapBitbucketCommit(commit: BitbucketCommit): SyncItem {
  const sha = commit.hash ?? "";
  return {
    externalId: `commit:${sha}`,
    data: {
      kind: "commit",
      sha,
      message: commit.message,
      author: commit.author?.raw,
      committedAt: commit.date,
    },
  };
}

function mapBitbucketPullRequest(pullRequest: BitbucketPullRequest): SyncItem {
  const number = pullRequest.id ?? 0;
  return {
    externalId: `pr:${number}`,
    data: {
      kind: "pull_request",
      number,
      title: pullRequest.title,
      state: pullRequest.state,
      sourceBranch: pullRequest.source?.branch?.name,
      targetBranch: pullRequest.destination?.branch?.name,
      url: pullRequest.links?.html?.href,
    },
  };
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}
