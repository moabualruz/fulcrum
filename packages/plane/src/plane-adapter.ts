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
  token?: string;
  fetchImpl?: typeof fetch;
}

export class PlaneApiAdapter implements ExternalPmAdapter {
  metadata = planeAdapterMetadata;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: PlaneApiAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.metadata = {
      ...planeAdapterMetadata,
      enabled: Boolean(options.baseUrl && options.token),
      credentialStatus: options.token ? "configured" : "not_configured"
    };
  }

  async healthCheck(): Promise<CapabilityHealthRecord> {
    if (!this.metadata.enabled || !this.options.baseUrl || !this.options.token) {
      return disabledPlaneHealth();
    }
    const now = new Date().toISOString();
    try {
      const response = await this.fetchImpl(this.options.baseUrl.replace(/\/$/, ""), {
        headers: { Authorization: `Bearer ${this.options.token}` },
        method: "GET"
      });
      if (!response.ok && response.status !== 404) {
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
    return [];
  }

  async rebuild(): Promise<PlaneWorkItem[]> {
    return [];
  }

  async importWorkItems(): Promise<PlaneWorkItem[]> {
    if (!this.options.baseUrl || !this.options.token) {
      throw new Error("Plane API is not configured");
    }
    const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/issues/`, {
      headers: { Authorization: `Bearer ${this.options.token}` }
    });
    if (!response.ok) {
      throw new Error(`Plane import failed: ${response.status}`);
    }
    const payload = (await response.json()) as { results?: unknown[] };
    return (payload.results ?? []).map((item) => {
      const row = item as Record<string, unknown>;
      return {
        externalId: String(row.id ?? row.external_id ?? ""),
        title: String(row.name ?? row.title ?? "Untitled Plane issue"),
        body: typeof row.description === "string" ? row.description : undefined,
        status: typeof row.state === "string" ? row.state : undefined,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
        url: typeof row.url === "string" ? row.url : undefined
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
    return input;
  }
}
