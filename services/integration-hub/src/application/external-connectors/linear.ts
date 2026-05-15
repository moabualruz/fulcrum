import type {
  ConnectorAdapter,
  HealthStatus,
  HistoricalImportOptions,
  HistoricalImportResult,
  SyncItem,
  SyncResult,
} from "./interface.ts";
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

    let after: string | undefined;
    const allItems: SyncItem[] = [];

    do {
      const response = await this.graphql(
        `query TeamIssues($teamId: String!, $after: String) {
          issues(filter: { team: { id: { eq: $teamId } } }, first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              identifier
              title
              estimate
              priority
              state { name type }
              cycle { name startsAt endsAt }
              assignee { email name }
              labels { nodes { name } }
            }
          }
        }`,
        { teamId: this.teamId, after },
      );
      if (!response.ok) return syncError(response, "linear_pull_failed");

      const body = (await response.json()) as { data?: { issues?: LinearIssueConnection } };
      const connection = body.data?.issues;
      const items = (connection?.nodes ?? []).map(mapLinearIssue);
      allItems.push(...items);
      after = connection?.pageInfo?.hasNextPage ? (connection.pageInfo.endCursor ?? undefined) : undefined;
    } while (after);

    this.pulledItems.splice(0, this.pulledItems.length, ...allItems);

    return { pulled: allItems.length, pushed: 0, skipped: 0, errors: [] };
  }

  async importHistory(options: HistoricalImportOptions): Promise<HistoricalImportResult> {
    this.assertEnabled();

    const batchSize = options.batchSize ?? 100;
    let after: string | undefined;
    let imported = 0;
    let batches = 0;

    do {
      const response = await this.graphql(
        `query HistoricalTeamIssues($teamId: String!, $after: String) {
          issues(filter: { team: { id: { eq: $teamId } } }, first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              identifier
              title
              estimate
              priority
              state { name type }
              cycle { name startsAt endsAt }
              assignee { email name }
              labels { nodes { name } }
            }
          }
        }`,
        { teamId: this.teamId, after },
      );
      if (!response.ok) return importError(response, "linear_import_failed", imported, batches);

      const body = (await response.json()) as { data?: { issues?: LinearIssueConnection } };
      const connection = body.data?.issues;
      const items = connection?.nodes?.map(mapLinearIssue) ?? [];
      for (const batch of chunk(items, batchSize)) {
        await options.store.upsertBatch(this.kind, batch);
        batches += 1;
      }
      imported += items.length;
      after = connection?.pageInfo?.hasNextPage ? (connection.pageInfo.endCursor ?? undefined) : undefined;
    } while (after);

    return { imported, upserted: imported, batches, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    const errors = [];
    let pushed = 0;
    for (const item of items) {
      // strip linear: prefix for Linear API
      const linearId = item.externalId.startsWith("linear:")
        ? item.externalId.slice("linear:".length)
        : item.externalId;
      const response = await this.graphql(
        `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success }
        }`,
        { id: linearId, input: linearUpdateInput(item) },
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
        authorization: `Bearer ${this.apiKey}`,
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
  priority?: number;
  state?: { name?: string; type?: string };
  cycle?: { name?: string; startsAt?: string; endsAt?: string } | null;
  assignee?: { email?: string; name?: string };
  labels?: { nodes?: Array<{ name?: string }> };
}

interface LinearIssueConnection {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  nodes?: LinearIssue[];
}

function mapLinearIssue(issue: LinearIssue): SyncItem {
  return {
    externalId: `linear:${issue.id ?? ""}`,
    data: {
      id: issue.id,
      title: issue.title,
      status: mapLinearStatus(issue.state),
      priority: mapLinearPriority(issue.priority),
      sprint: issue.cycle?.name ?? undefined,
      estimate: issue.estimate,
      assignee: issue.assignee?.email ?? issue.assignee?.name,
      labels: issue.labels?.nodes?.map((label) => label.name).filter((name) => typeof name === "string") ?? [],
    },
  };
}

/** Linear priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low */
function mapLinearPriority(priority?: number): string {
  switch (priority) {
    case 1:
      return "urgent";
    case 2:
      return "high";
    case 3:
      return "medium";
    case 4:
      return "low";
    default:
      return "none";
  }
}

function linearUpdateInput(item: SyncItem): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (typeof item.data.title === "string") input.title = item.data.title;
  if (typeof item.data.status === "string") input.stateName = linearStateName(item.data.status);
  return input;
}

function mapLinearStatus(state?: { name?: string; type?: string }): string {
  if (state?.type === "completed") return "done";
  if (state?.type === "canceled") return "cancelled";
  const normalized = state?.name?.toLowerCase();
  if (normalized === "done" || normalized === "completed") return "done";
  if (normalized === "started" || normalized === "in progress") return "in-progress";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  return "todo";
}

function linearStateName(status: string): string {
  if (status === "done") return "Done";
  if (status === "in-progress") return "In Progress";
  if (status === "cancelled") return "Cancelled";
  return "Todo";
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}

async function importError(
  response: Response,
  code: string,
  imported: number,
  batches: number,
): Promise<HistoricalImportResult> {
  return { imported, upserted: imported, batches, errors: [{ message: response.statusText, code }] };
}

function chunk<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, batchSize);
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
