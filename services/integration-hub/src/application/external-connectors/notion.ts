import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface NotionConnectorOptions {
  token?: string;
  databaseId?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class NotionConnector implements ConnectorAdapter {
  readonly kind = "notion";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly seenExternalIds = new Set<string>();
  private readonly token: string;
  private readonly databaseId: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: NotionConnectorOptions = {}) {
    this.token = options.token ?? process.env.NOTION_TOKEN ?? "";
    this.databaseId = options.databaseId ?? process.env.NOTION_DATABASE_ID ?? "";
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

    const databaseResponse = await this.request(`/databases/${encodeURIComponent(this.databaseId)}/query`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!databaseResponse.ok) return syncError(databaseResponse, "notion_database_pull_failed");

    const pagesResponse = await this.request("/search", {
      method: "POST",
      body: JSON.stringify({ filter: { property: "object", value: "page" } }),
    });
    if (!pagesResponse.ok) return syncError(pagesResponse, "notion_pages_pull_failed");

    const databaseBody = (await databaseResponse.json()) as { results?: NotionPage[] };
    const pagesBody = (await pagesResponse.json()) as { results?: NotionPage[] };
    return this.recordPulledItems([
      ...(databaseBody.results ?? []).map(mapNotionTask),
      ...(pagesBody.results ?? []).map(mapNotionDoc),
    ]);
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();
    return {
      pulled: 0,
      pushed: 0,
      skipped: items.length,
      errors: [],
    };
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    this.assertEnabled();

    try {
      const response = await this.request("/users/me");
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
    return this.fetchImpl(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: "application/json",
        "content-type": "application/json",
        "notion-version": "2022-06-28",
        ...init.headers,
      },
    });
  }

  private recordPulledItems(items: SyncItem[]): SyncResult {
    let pulled = 0;
    let skipped = 0;
    for (const item of items) {
      if (this.seenExternalIds.has(item.externalId)) {
        skipped += 1;
        continue;
      }
      this.seenExternalIds.add(item.externalId);
      this.pulledItems.push(item);
      pulled += 1;
    }
    return { pulled, pushed: 0, skipped, errors: [] };
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new Error(`connector disabled: ${connectorFlag(this.kind)}`);
  }
}

interface NotionPage {
  id?: string;
  object?: string;
  properties?: Record<string, NotionProperty>;
}

interface NotionProperty {
  title?: Array<{ plain_text?: string }>;
  status?: { name?: string };
  select?: { name?: string };
  date?: { start?: string };
}

function mapNotionTask(page: NotionPage): SyncItem {
  const externalId = page.id ?? "";
  return {
    externalId,
    data: {
      kind: "task",
      title: notionTitle(page.properties),
      status: mapNotionStatus(notionStatus(page.properties)),
      dueDate: notionDate(page.properties),
      metadata_json: { external_id: externalId, source: "notion" },
    },
  };
}

function mapNotionDoc(page: NotionPage): SyncItem {
  const externalId = page.id ?? "";
  const title = notionTitle(page.properties);
  return {
    externalId,
    data: {
      kind: "doc",
      title,
      docType: "wiki",
      content: textToTiptap(title),
      metadata_json: { external_id: externalId, source: "notion" },
    },
  };
}

function notionTitle(properties: Record<string, NotionProperty> = {}): string {
  for (const property of Object.values(properties)) {
    const title = property.title?.map((part) => part.plain_text ?? "").join("").trim();
    if (title) return title;
  }
  return "";
}

function notionStatus(properties: Record<string, NotionProperty> = {}): string | undefined {
  for (const property of Object.values(properties)) {
    if (property.status?.name) return property.status.name;
    if (property.select?.name) return property.select.name;
  }
}

function notionDate(properties: Record<string, NotionProperty> = {}): string | undefined {
  for (const property of Object.values(properties)) {
    if (property.date?.start) return property.date.start;
  }
}

function mapNotionStatus(status?: string): string {
  const normalized = status?.toLowerCase();
  if (normalized === "done" || normalized === "complete" || normalized === "completed") return "done";
  if (normalized === "in progress" || normalized === "doing") return "in-progress";
  return "todo";
}

function textToTiptap(text: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}
