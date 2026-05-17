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

export interface PlaneConnectorOptions {
  url?: string;
  token?: string;
  workspaceSlug?: string;
  fetch?: ConnectorFetch;
}

export interface ConnectorHealthStatus extends HealthStatus {
  status?: "ok" | "auth_failed" | "unreachable";
}

export class PlaneConnector implements ConnectorAdapter {
  readonly kind = "plane";
  readonly pulledItems: SyncItem[] = [];

  private enabled = false;
  private readonly url: string;
  private readonly token: string;
  private readonly workspaceSlug: string;
  private readonly fetchImpl: ConnectorFetch;

  constructor(options: PlaneConnectorOptions = {}) {
    this.url = stripTrailingSlash(options.url ?? process.env.PLANE_URL ?? "");
    this.token = options.token ?? process.env.PLANE_TOKEN ?? "";
    this.workspaceSlug = options.workspaceSlug ?? process.env.PLANE_WORKSPACE_SLUG ?? "";
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

    const response = await this.request(`/api/v1/workspaces/${encodeURIComponent(this.workspaceSlug)}/issues/`);
    if (!response.ok) return syncError(response, "plane_pull_failed");

    const body = (await response.json()) as PlaneIssuePage;
    const items = (body.results ?? []).map(mapPlaneIssue);
    this.pulledItems.splice(0, this.pulledItems.length, ...items);

    return { pulled: items.length, pushed: 0, skipped: 0, errors: [] };
  }

  async push(items: SyncItem[]): Promise<SyncResult> {
    this.assertEnabled();

    return {
      pulled: 0,
      pushed: 0,
      skipped: items.length,
      errors: items.map((item) => ({
        externalId: item.externalId,
        message: "Plane historical connector is read-only",
        code: "plane_push_unsupported",
      })),
    };
  }

  async importHistory(options: HistoricalImportOptions): Promise<HistoricalImportResult> {
    this.assertEnabled();

    const batchSize = options.batchSize ?? 100;
    let cursor: string | undefined;
    let imported = 0;
    let batches = 0;

    do {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await this.request(
        `/api/v1/workspaces/${encodeURIComponent(this.workspaceSlug)}/issues/${suffix}`,
      );
      if (!response.ok) return importError(response, "plane_import_failed", imported, batches);

      const body = (await response.json()) as PlaneIssuePage;
      const items = (body.results ?? []).map(mapPlaneIssue);
      for (const batch of chunk(items, batchSize)) {
        await options.store.upsertBatch(this.kind, batch);
        batches += 1;
      }
      imported += items.length;
      cursor = body.next_cursor ?? body.nextCursor ?? undefined;
    } while (cursor);

    return { imported, upserted: imported, batches, errors: [] };
  }

  async healthCheck(): Promise<ConnectorHealthStatus> {
    this.assertEnabled();

    try {
      const response = await this.request(`/api/v1/workspaces/${encodeURIComponent(this.workspaceSlug)}/`);
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

interface PlaneIssuePage {
  next_cursor?: string | null;
  nextCursor?: string | null;
  results?: PlaneIssue[];
}

interface PlaneIssue {
  id?: string;
  sequence_id?: number;
  name?: string;
  state?: { name?: string; group?: string };
  priority?: string;
  module?: { name?: string };
  assignees?: Array<{ email?: string; display_name?: string; displayName?: string }>;
  labels?: Array<{ name?: string }>;
}

function mapPlaneIssue(issue: PlaneIssue): SyncItem {
  return {
    externalId: String(issue.sequence_id ?? issue.id ?? ""),
    data: {
      id: issue.id,
      title: issue.name,
      status: mapPlaneStatus(issue.state),
      priority: issue.priority,
      sprint: issue.module?.name,
      assignee: issue.assignees?.[0]?.email ?? issue.assignees?.[0]?.display_name ?? issue.assignees?.[0]?.displayName,
      labels: issue.labels?.map((label) => label.name).filter((name) => typeof name === "string") ?? [],
    },
  };
}

function mapPlaneStatus(state?: { name?: string; group?: string }): string {
  if (state?.group === "completed") return "done";
  const normalized = state?.name?.toLowerCase();
  if (normalized === "done" || normalized === "completed") return "done";
  if (normalized === "started" || normalized === "in progress") return "in-progress";
  return "todo";
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
