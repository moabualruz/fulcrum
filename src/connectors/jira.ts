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

export interface JiraStatusMap {
  [jiraStatus: string]: string;
}

export interface JiraConnectorOptions {
  url?: string;
  token?: string;
  projectKey?: string;
  fetch?: ConnectorFetch;
  statusMap?: JiraStatusMap;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class JiraConnector implements ConnectorAdapter {
  readonly kind = "jira";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly url: string;
  private readonly token: string;
  private readonly projectKey: string;
  private readonly fetchImpl: ConnectorFetch;
  private readonly statusMap: JiraStatusMap;

  constructor(options: JiraConnectorOptions = {}) {
    this.url = stripTrailingSlash(options.url ?? process.env.JIRA_URL ?? "");
    this.token = options.token ?? process.env.JIRA_TOKEN ?? "";
    this.projectKey = options.projectKey ?? process.env.JIRA_PROJECT_KEY ?? "";
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.statusMap = options.statusMap ?? {};
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

    const response = await this.request(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(`project=${this.projectKey}`)}`,
    );
    if (!response.ok) return syncError(response, "jira_pull_failed");

    const body = (await response.json()) as { issues?: JiraIssue[] };
    const items = (body.issues ?? []).map((issue) => mapJiraIssue(issue, this.statusMap));
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async importHistory(options: HistoricalImportOptions): Promise<HistoricalImportResult> {
    this.assertEnabled();

    const batchSize = options.batchSize ?? 100;
    const maxResults = batchSize;
    let startAt = 0;
    let imported = 0;
    let batches = 0;

    for (;;) {
      const path = `/rest/api/3/search/jql?jql=${encodeURIComponent(`project=${this.projectKey}`)}&startAt=${startAt}&maxResults=${maxResults}`;
      const response = await this.request(path);
      if (!response.ok) return importError(response, "jira_import_failed", imported, batches);

      const body = (await response.json()) as JiraSearchResponse;
      const items = (body.issues ?? []).map((issue) => mapJiraIssue(issue, this.statusMap));
      for (const batch of chunk(items, batchSize)) {
        await options.store.upsertBatch(this.kind, batch);
        batches += 1;
      }
      imported += items.length;

      const nextStartAt = (body.startAt ?? startAt) + (body.maxResults ?? items.length);
      if (nextStartAt >= (body.total ?? imported) || items.length === 0) break;
      startAt = nextStartAt;
    }

    return { imported, upserted: imported, batches, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    const errors = [];
    let pushed = 0;
    for (const item of items) {
      const jiraKey = stripExternalIdPrefix(item.externalId);
      const response = await this.request(`/rest/api/3/issue/${encodeURIComponent(jiraKey)}`, {
        method: "PATCH",
        body: JSON.stringify(jiraUpdatePayload(item)),
      });
      if (response.ok) {
        pushed += 1;
      } else {
        errors.push({ externalId: item.externalId, message: response.statusText, code: "jira_push_failed" });
      }
    }

    return { pulled: 0, pushed, skipped: 0, errors };
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    this.assertEnabled();

    try {
      const response = await this.request("/rest/api/3/myself");
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
    return this.fetchImpl(`${this.url}${path}`, {
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

interface JiraIssue {
  id?: string;
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string };
    assignee?: { emailAddress?: string; displayName?: string };
    duedate?: string;
    labels?: string[];
    parent?: { key?: string };
  };
}

interface JiraSearchResponse {
  startAt?: number;
  maxResults?: number;
  total?: number;
  issues?: JiraIssue[];
}

function mapJiraIssue(issue: JiraIssue, statusMap: JiraStatusMap): SyncItem {
  const fields = issue.fields ?? {};
  const key = issue.key ?? issue.id ?? "";
  return {
    externalId: `jira:${key}`,
    data: {
      id: issue.id,
      title: fields.summary,
      status: mapJiraStatus(fields.status?.name, statusMap),
      priority: mapPriority(fields.priority?.name),
      assignee: fields.assignee?.emailAddress ?? fields.assignee?.displayName,
      dueDate: fields.duedate,
      labels: fields.labels ?? [],
      parentExternalId: fields.parent?.key ? `jira:${fields.parent.key}` : undefined,
    },
  };
}

function jiraUpdatePayload(item: SyncItem): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof item.data.title === "string") fields.summary = item.data.title;

  const payload: Record<string, unknown> = { fields };
  if (typeof item.data.status === "string") payload.transition = { status: jiraStatusName(item.data.status) };
  return payload;
}

function mapJiraStatus(status?: string, statusMap: JiraStatusMap = {}): string {
  if (status && status in statusMap) return statusMap[status]!;
  const normalized = status?.toLowerCase();
  if (normalized && normalized in statusMap) return statusMap[normalized]!;
  if (normalized === "done" || normalized === "closed" || normalized === "resolved") return "done";
  if (normalized === "in progress") return "in-progress";
  return "todo";
}

function jiraStatusName(status: string): string {
  if (status === "done") return "Done";
  if (status === "in-progress") return "In Progress";
  return "To Do";
}

function mapPriority(priority?: string): string | undefined {
  return priority?.toLowerCase();
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

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function stripExternalIdPrefix(externalId: string): string {
  return externalId.startsWith("jira:") ? externalId.slice(5) : externalId;
}
