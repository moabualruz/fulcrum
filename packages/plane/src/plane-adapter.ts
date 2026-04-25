import type { AdapterPreview } from "@fulcrum/core";
import type { CapabilityHealthRecord } from "@fulcrum/shared";
import {
  disabledPlaneHealth,
  externalWritebackPreview,
  planeAdapterMetadata,
  type ExternalPmAdapter,
  type PlaneWorkItem,
  type PlaneWritebackInput
} from "./adapter.js";

export interface PlaneApiAdapterOptions {
  baseUrl?: string;
  workspaceSlug?: string;
  projectId?: string;
  apiKey?: string;
  oauthToken?: string;
  /**
   * Backwards-compatible alias for apiKey. Plane API docs prefer X-API-Key for API keys
   * and Authorization: Bearer for OAuth tokens.
   */
  token?: string;
  fetchImpl?: typeof fetch;
}

export class PlaneApiAdapter implements ExternalPmAdapter {
  metadata = planeAdapterMetadata;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: PlaneApiAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    const hasAuth = Boolean(options.apiKey ?? options.token ?? options.oauthToken);
    this.metadata = {
      ...planeAdapterMetadata,
      enabled: Boolean(options.baseUrl && options.workspaceSlug && options.projectId && hasAuth),
      credentialStatus: hasAuth ? "configured" : "not_configured"
    };
  }

  async healthCheck(): Promise<CapabilityHealthRecord> {
    if (!this.options.baseUrl || !this.hasAuth()) {
      return disabledPlaneHealth();
    }
    const now = new Date().toISOString();
    if (!this.options.workspaceSlug || !this.options.projectId) {
      return {
        ...disabledPlaneHealth(now),
        state: "degraded",
        cause: "Plane workspace slug and project ID are required for live mode.",
        nextAction: "Set FULCRUM_PLANE_WORKSPACE_SLUG and FULCRUM_PLANE_PROJECT_ID.",
        privacyStatus: "operator_configured"
      };
    }
    try {
      const response = await this.fetchImpl(this.workItemsUrl(), {
        headers: this.authHeaders(),
        method: "GET"
      });
      if (!response.ok) {
        return {
          ...disabledPlaneHealth(now),
          state: "degraded",
          cause: `Plane API connectivity failed: ${response.status}.`,
          nextAction: "Check Plane base URL, token, and workspace permissions.",
          privacyStatus: "operator_configured"
        };
      }
    } catch {
      return {
        ...disabledPlaneHealth(now),
        state: "degraded",
        cause: "Plane API is unreachable.",
        nextAction: "Check Plane network connectivity or disable Plane adapter.",
        privacyStatus: "operator_configured"
      };
    }
    return {
      ...disabledPlaneHealth(now),
      state: "detected",
      cause: "Plane API credentials and connectivity are present.",
      nextAction: "Run import or preview writeback.",
      privacyStatus: "operator_configured"
    };
  }

  async describeCapabilities() {
    return {
      supported: ["import_work_items", "preview_writeback"],
      optional: ["execute_writeback"],
      unavailable: this.metadata.enabled ? [] : ["remote_api"],
      localFallback: ["existing_local_mirrors"],
      policyGated: ["external_writeback"]
    };
  }

  async preview(operation: string, input: unknown): Promise<AdapterPreview> {
    if (operation === "writeback") {
      return externalWritebackPreview(input as PlaneWritebackInput);
    }
    return {
      effects: ["Fetch selected Plane issues"],
      recordsAffected: [],
      externalVisibility: "remote",
      policyRequirements: [],
      redactionStatus: "not_applicable",
      dataSharedExternally: []
    };
  }

  async execute(operation: string, input: unknown, policyDecisionId?: string) {
    if (operation === "writeback") {
      return this.writeback(input as PlaneWritebackInput, policyDecisionId ?? "");
    }
    return this.importWorkItems();
  }

  async disable(): Promise<void> {
    this.metadata = { ...this.metadata, enabled: false };
  }

  async exportLocalState(): Promise<PlaneWorkItem[]> {
    return this.metadata.enabled ? this.importWorkItems() : [];
  }

  async rebuild(): Promise<PlaneWorkItem[]> {
    return this.metadata.enabled ? this.importWorkItems() : [];
  }

  async importWorkItems(): Promise<PlaneWorkItem[]> {
    this.assertConfigured();
    const response = await this.fetchImpl(this.workItemsUrl(), {
      headers: this.authHeaders()
    });
    if (!response.ok) {
      throw new Error(`Plane import failed: ${response.status}`);
    }
    const payload = (await response.json()) as { results?: unknown[] };
    return (payload.results ?? []).map((item) => {
      const row = item as Record<string, unknown>;
      const externalId = String(row.id ?? row.external_id ?? "");
      return {
        externalId,
        title: String(row.name ?? row.title ?? "Untitled Plane issue"),
        body: stringFrom(row.description_stripped) ?? stringFrom(row.description),
        status: stringFrom(row.state_detail) ?? stringFrom(row.state),
        updatedAt: stringFrom(row.updated_at),
        url: stringFrom(row.url) ?? this.workItemUrl(externalId)
      };
    });
  }

  async previewWriteback(input: PlaneWritebackInput): Promise<AdapterPreview> {
    return externalWritebackPreview(input);
  }

  async writeback(
    input: PlaneWritebackInput,
    policyDecisionId: string
  ): Promise<PlaneWritebackInput> {
    if (!policyDecisionId) {
      throw new Error("Policy decision required for Plane writeback");
    }
    this.assertConfigured();
    if (input.status) {
      const response = await this.fetchImpl(this.workItemUrl(input.externalId), {
        method: "PATCH",
        headers: this.jsonHeaders(),
        body: JSON.stringify({ state: input.status })
      });
      if (!response.ok) {
        throw new Error(`Plane status update failed: ${response.status}`);
      }
    }
    if (input.comment) {
      const response = await this.fetchImpl(`${this.workItemUrl(input.externalId)}comments/`, {
        method: "POST",
        headers: this.jsonHeaders(),
        body: JSON.stringify({
          comment_html: `<p>${escapeHtml(input.comment)}</p>`,
          access: "EXTERNAL",
          external_source: "fulcrum",
          external_id: policyDecisionId
        })
      });
      if (!response.ok) {
        throw new Error(`Plane comment writeback failed: ${response.status}`);
      }
    }
    return input;
  }

  private assertConfigured(): void {
    if (
      !this.options.baseUrl ||
      !this.options.workspaceSlug ||
      !this.options.projectId ||
      !this.hasAuth()
    ) {
      throw new Error("Plane API is not configured");
    }
  }

  private hasAuth(): boolean {
    return Boolean(this.options.apiKey ?? this.options.token ?? this.options.oauthToken);
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const apiKey = this.options.apiKey ?? this.options.token;
    if (apiKey) headers["X-API-Key"] = apiKey;
    if (this.options.oauthToken) headers.Authorization = `Bearer ${this.options.oauthToken}`;
    return headers;
  }

  private jsonHeaders(): Record<string, string> {
    return { ...this.authHeaders(), "Content-Type": "application/json" };
  }

  private apiBase(): string {
    return `${this.options.baseUrl!.replace(/\/$/, "")}/api/v1/workspaces/${encodeURIComponent(
      this.options.workspaceSlug!
    )}/projects/${encodeURIComponent(this.options.projectId!)}`;
  }

  private workItemsUrl(): string {
    return `${this.apiBase()}/work-items/`;
  }

  private workItemUrl(workItemId: string): string {
    return `${this.workItemsUrl()}${encodeURIComponent(workItemId)}/`;
  }
}

function stringFrom(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "title", "id"]) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
