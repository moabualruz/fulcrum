import type { AdapterMetadata, CapabilityHealthRecord } from "@fulcrum/shared";
import type { FulcrumAdapter } from "./adapter.js";

export interface AdapterConfigurationRepositoryPort {
  save(metadata: AdapterMetadata): AdapterMetadata;
  get(adapterId: string): AdapterMetadata | undefined;
  list(): AdapterMetadata[];
}

export interface AdapterRegistryEntry {
  metadata: AdapterMetadata;
  health: CapabilityHealthRecord;
  capabilities: {
    supported: string[];
    optional: string[];
    unavailable: string[];
    localFallback: string[];
    policyGated: string[];
  };
}

export interface AdapterReplacementResult {
  previous: AdapterMetadata;
  replacement: AdapterMetadata;
  preservedLocalHistory: string[];
}

export class AdapterRegistryService {
  private readonly adapters = new Map<string, FulcrumAdapter>();

  constructor(
    adapters: FulcrumAdapter[],
    private readonly repository?: AdapterConfigurationRepositoryPort
  ) {
    for (const adapter of adapters) {
      this.applyPersistedMetadata(adapter);
      this.adapters.set(adapter.metadata.adapterId, adapter);
      if (!this.repository?.get(adapter.metadata.adapterId)) {
        this.repository?.save(adapter.metadata);
      }
    }
  }

  listConfigurations(): AdapterMetadata[] {
    const persisted = this.repository?.list();
    if (persisted?.length) {
      return persisted;
    }
    return [...this.adapters.values()].map((adapter) => adapter.metadata);
  }

  async listHealth(): Promise<AdapterRegistryEntry[]> {
    const entries = await Promise.all(
      [...this.adapters.values()].map((adapter) => this.health(adapter.metadata.adapterId))
    );
    return entries.sort((left, right) =>
      left.metadata.adapterId.localeCompare(right.metadata.adapterId)
    );
  }

  async health(adapterId: string): Promise<AdapterRegistryEntry> {
    const adapter = this.requireAdapter(adapterId);
    this.applyPersistedMetadata(adapter);
    const health = await adapter.healthCheck();
    const capabilities = await adapter.describeCapabilities();
    return { metadata: adapter.metadata, health, capabilities };
  }

  async enable(adapterId: string): Promise<AdapterMetadata> {
    const adapter = this.requireAdapter(adapterId);
    this.applyPersistedMetadata(adapter);
    adapter.metadata.enabled = true;
    return this.persist(adapter.metadata);
  }

  async disable(adapterId: string, reason: string): Promise<AdapterMetadata> {
    const adapter = this.requireAdapter(adapterId);
    this.applyPersistedMetadata(adapter);
    await adapter.disable(reason);
    return this.persist(adapter.metadata);
  }

  async replace(adapterId: string, replacement: FulcrumAdapter): Promise<AdapterReplacementResult> {
    const previous = this.requireMetadata(adapterId);
    replacement.metadata.adapterId = adapterId;
    replacement.metadata.category = previous.category;
    replacement.metadata.enabled = previous.enabled;
    this.adapters.set(adapterId, replacement);
    const replacementMetadata = this.persist({
      ...replacement.metadata,
      adapterId
    });
    return {
      previous,
      replacement: replacementMetadata,
      preservedLocalHistory: [
        "projects",
        "tasks",
        "runs",
        "artifacts",
        "policy_decisions",
        "context_packs",
        "provenance"
      ]
    };
  }

  private currentMetadata(adapterId: string): AdapterMetadata | undefined {
    return this.repository?.get(adapterId) ?? this.adapters.get(adapterId)?.metadata;
  }

  private requireMetadata(adapterId: string): AdapterMetadata {
    const metadata = this.currentMetadata(adapterId);
    if (!metadata) {
      throw new Error(`Unknown adapter: ${adapterId}`);
    }
    return metadata;
  }

  private requireAdapter(adapterId: string): FulcrumAdapter {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${adapterId}`);
    }
    return adapter;
  }

  private persist(metadata: AdapterMetadata): AdapterMetadata {
    const adapter = this.adapters.get(metadata.adapterId);
    if (adapter) {
      adapter.metadata = { ...adapter.metadata, ...metadata };
    }
    return this.repository?.save(adapter?.metadata ?? metadata) ?? adapter?.metadata ?? metadata;
  }

  private applyPersistedMetadata(adapter: FulcrumAdapter): void {
    const persisted = this.repository?.get(adapter.metadata.adapterId);
    if (persisted) {
      adapter.metadata = { ...adapter.metadata, ...persisted };
    }
  }
}

export function summarizeAdapterDegradation(
  entries: AdapterRegistryEntry[]
): CapabilityHealthRecord[] {
  return entries.map((entry) => entry.health);
}
