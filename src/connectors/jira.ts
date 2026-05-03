import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface JiraConnectorOptions {
  url?: string;
  token?: string;
  projectKey?: string;
  fetch?: ConnectorFetch;
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

  constructor(options: JiraConnectorOptions = {}) {
    this.url = stripTrailingSlash(options.url ?? process.env.JIRA_URL ?? "");
    this.token = options.token ?? process.env.JIRA_TOKEN ?? "";
    this.projectKey = options.projectKey ?? process.env.JIRA_PROJECT_KEY ?? "";
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

    const response = await this.request(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(`project=${this.projectKey}`)}`,
    );
    if (!response.ok) return syncError(response, "jira_pull_failed");

    const body = (await response.json()) as { issues?: JiraIssue[] };
    const items = (body.issues ?? []).map(mapJiraIssue);
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    const errors = [];
    let pushed = 0;
    for (const item of items) {
      const response = await this.request(`/rest/api/3/issue/${encodeURIComponent(item.externalId)}`, {
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
  };
}

function mapJiraIssue(issue: JiraIssue): SyncItem {
  const fields = issue.fields ?? {};
  return {
    externalId: issue.key ?? issue.id ?? "",
    data: {
      id: issue.id,
      title: fields.summary,
      status: mapJiraStatus(fields.status?.name),
      priority: mapPriority(fields.priority?.name),
      assignee: fields.assignee?.emailAddress ?? fields.assignee?.displayName,
      dueDate: fields.duedate,
      labels: fields.labels ?? [],
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

function mapJiraStatus(status?: string): string {
  const normalized = status?.toLowerCase();
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

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
