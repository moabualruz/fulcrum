import type {
  ConnectorAdapter,
  ConnectorKind,
  HealthStatus,
  SyncItem,
  SyncResult,
} from "./interface.ts";

export class FeatureDisabledError extends Error {
  readonly flag: string;
  readonly kind: ConnectorKind;

  constructor(kind: ConnectorKind) {
    const flag = connectorFlag(kind);
    super(`feature flag disabled: ${flag}`);
    this.name = "FeatureDisabledError";
    this.flag = flag;
    this.kind = kind;
  }
}

export interface ConnectorState {
  orgId: string;
  kind: ConnectorKind;
  name: string;
  enabled: boolean;
}

export interface ConnectorRegistryOptions {
  isFeatureEnabled?: (kind: ConnectorKind, ctx: { orgId: string }) => Promise<boolean> | boolean;
}

export function connectorFlag(kind: ConnectorKind): string {
  return `connector-${kind}`;
}

export class ConnectorRegistry {
  private readonly adapters = new Map<ConnectorKind, ConnectorAdapter>();
  private readonly connectedKinds: ConnectorKind[] = [];
  private readonly enabled = new Map<string, ConnectorState>();

  constructor(private readonly options: ConnectorRegistryOptions = {}) {}

  register(adapter: ConnectorAdapter): void {
    if (this.adapters.has(adapter.kind)) {
      throw new Error(`connector already registered: ${adapter.kind}`);
    }

    this.adapters.set(adapter.kind, adapter);
  }

  lookup(kind: ConnectorKind): ConnectorAdapter | null {
    return this.adapters.get(kind) ?? null;
  }

  list(): ConnectorAdapter[] {
    return [...this.adapters.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  }

  async enable(kind: ConnectorKind, input: { orgId: string; name?: string }): Promise<ConnectorState> {
    this.require(kind);

    const isEnabled = await this.isFeatureEnabled(kind, input.orgId);
    if (!isEnabled) {
      throw new FeatureDisabledError(kind);
    }

    const state: ConnectorState = {
      orgId: input.orgId,
      kind,
      name: input.name ?? kind,
      enabled: true,
    };
    this.enabled.set(this.stateKey(input.orgId, kind), state);
    return state;
  }

  async connect(kind: ConnectorKind): Promise<void> {
    const adapter = this.require(kind);
    if (this.connectedKinds.includes(kind)) return;

    await adapter.connect();
    this.connectedKinds.push(kind);
  }

  async disconnect(kind: ConnectorKind): Promise<void> {
    const adapter = this.require(kind);
    const index = this.connectedKinds.lastIndexOf(kind);
    if (index === -1) return;

    await adapter.disconnect();
    this.connectedKinds.splice(index, 1);
  }

  async connectAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await this.connect(adapter.kind);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const kind of [...this.connectedKinds].reverse()) {
      await this.disconnect(kind);
    }
  }

  async pull(kind: ConnectorKind): Promise<SyncResult> {
    return this.require(kind).pull();
  }

  async push(kind: ConnectorKind, items: SyncItem[]): Promise<SyncResult> {
    return this.require(kind).push(items);
  }

  async healthCheck(kind: ConnectorKind): Promise<HealthStatus> {
    return this.require(kind).healthCheck();
  }

  private require(kind: ConnectorKind): ConnectorAdapter {
    const adapter = this.lookup(kind);
    if (!adapter) {
      throw new Error(`connector not registered: ${kind}`);
    }
    return adapter;
  }

  private async isFeatureEnabled(kind: ConnectorKind, orgId: string): Promise<boolean> {
    if (!this.options.isFeatureEnabled) return true;
    return this.options.isFeatureEnabled(kind, { orgId });
  }

  private stateKey(orgId: string, kind: ConnectorKind): string {
    return `${orgId}:${kind}`;
  }
}
