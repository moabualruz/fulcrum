import type { ConnectorAdapter, HealthStatus, SyncItem, SyncResult } from "./interface.ts";
import { connectorFlag } from "./registry.ts";

type ConnectorFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ConfluenceConnectorOptions {
  url?: string;
  token?: string;
  spaceKey?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class ConfluenceConnector implements ConnectorAdapter {
  readonly kind = "confluence";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly seenExternalIds = new Set<string>();
  private readonly url: string;
  private readonly token: string;
  private readonly spaceKey: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: ConfluenceConnectorOptions = {}) {
    this.url = stripTrailingSlash(options.url ?? process.env.CONFLUENCE_URL ?? "");
    this.token = options.token ?? process.env.CONFLUENCE_TOKEN ?? "";
    this.spaceKey = options.spaceKey ?? process.env.CONFLUENCE_SPACE_KEY ?? "";
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
      `/rest/api/content?spaceKey=${encodeURIComponent(this.spaceKey)}&expand=body.storage,space`,
    );
    if (!response.ok) return syncError(response, "confluence_pull_failed");

    const body = (await response.json()) as { results?: ConfluencePage[] };
    return this.recordPulledItems((body.results ?? []).map(mapConfluencePage));
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
      const response = await this.request(`/rest/api/space/${encodeURIComponent(this.spaceKey)}`);
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

interface ConfluencePage {
  id?: string;
  title?: string;
  space?: { key?: string };
  body?: { storage?: { value?: string } };
}

function mapConfluencePage(page: ConfluencePage): SyncItem {
  const externalId = page.id ?? "";
  return {
    externalId,
    data: {
      title: page.title,
      docType: "wiki",
      scope: "project",
      spaceKey: page.space?.key,
      content: htmlToTiptap(page.body?.storage?.value ?? ""),
      metadata_json: { external_id: externalId, source: "confluence" },
    },
  };
}

function htmlToTiptap(value: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: stripTags(value) }] }],
  };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

async function syncError(response: Response, code: string): Promise<SyncResult> {
  return { pulled: 0, pushed: 0, skipped: 0, errors: [{ message: response.statusText, code }] };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
