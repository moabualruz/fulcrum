import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface LinearConnectorOptions {
  apiKey?: string;
  teamId?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class LinearConnector implements ConnectorAdapter {
  readonly kind = "linear";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly apiKey: string;
  private readonly teamId: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: LinearConnectorOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.LINEAR_API_KEY ?? "";
    this.teamId = options.teamId ?? process.env.LINEAR_TEAM_ID ?? "";
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

    const response = await this.graphql(
      `query TeamIssues($teamId: String!) {
        issues(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            identifier
            title
            estimate
            state { name type }
            cycle { name }
            assignee { email name }
            labels { nodes { name } }
          }
        }
      }`,
      { teamId: this.teamId },
    );
    if (!response.ok) return syncError(response, "linear_pull_failed");

    const body = (await response.json()) as { data?: { issues?: { nodes?: LinearIssue[] } } };
    const items = (body.data?.issues?.nodes ?? []).map(mapLinearIssue);
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    const errors = [];
    let pushed = 0;
    for (const item of items) {
      const response = await this.graphql(
        `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success }
        }`,
        { id: item.externalId, input: linearUpdateInput(item) },
      );
      if (response.ok) {
        pushed += 1;
      } else {
        errors.push({ externalId: item.externalId, message: response.statusText, code: "linear_push_failed" });
      }
    }

    return { pulled: 0, pushed, skipped: 0, errors };
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    this.assertEnabled();

    try {
      const response = await this.graphql("query Viewer { viewer { id } }", {});
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

  private graphql(query: string, variables: Record<string, unknown>): Promise<Response> {
    return this.fetchImpl("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        authorization: this.apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new Error(`connector disabled: ${connectorFlag(this.kind)}`);
  }
}

interface LinearIssue {
  id?: string;
  identifier?: string;
  title?: string;
  estimate?: number;
  state?: { name?: string; type?: string };
  cycle?: { name?: string };
  assignee?: { email?: string; name?: string };
  labels?: { nodes?: Array<{ name?: string }> };
}

function mapLinearIssue(issue: LinearIssue): SyncItem {
  return {
    externalId: issue.identifier ?? issue.id ?? "",
    data: {
      id: issue.id,
      title: issue.title,
      status: mapLinearStatus(issue.state),
      sprint: issue.cycle?.name,
      estimate: issue.estimate,
      assignee: issue.assignee?.email ?? issue.assignee?.name,
      labels: issue.labels?.nodes?.map((label) => label.name).filter((name) => typeof name === "string") ?? [],
    },
  };
}

function linearUpdateInput(item: SyncItem): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (typeof item.data.title === "string") input.title = item.data.title;
  if (typeof item.data.status === "string") input.stateName = linearStateName(item.data.status);
  return input;
}

function mapLinearStatus(state?: { name?: string; type?: string }): string {
  if (state?.type === "completed") return "done";
  const normalized = state?.name?.toLowerCase();
  if (normalized === "done" || normalized === "completed") return "done";
  if (normalized === "started" || normalized === "in progress") return "in-progress";
  return "todo";
}

function linearStateName(status: string): string {
  if (status === "done") return "Done";
  if (status === "in-progress") return "In Progress";
  return "Todo";
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}
