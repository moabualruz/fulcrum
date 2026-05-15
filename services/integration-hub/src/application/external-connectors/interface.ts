export const CONNECTOR_KINDS = [
  "jira",
  "linear",
  "plane",
  "github-issues",
  "github",
  "gitlab",
  "bitbucket",
  "confluence",
  "notion",
] as const;

export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export interface SyncItem {
  externalId: string;
  data: Record<string, unknown>;
}

export interface SyncError {
  externalId?: string;
  message: string;
  code?: string;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  skipped: number;
  errors: SyncError[];
}

export interface HistoricalImportStore {
  upsertBatch(kind: ConnectorKind, items: SyncItem[]): Promise<void>;
}

export interface HistoricalImportOptions {
  store: HistoricalImportStore;
  batchSize?: number;
}

export interface HistoricalImportResult {
  imported: number;
  upserted: number;
  batches: number;
  errors: SyncError[];
}

export interface HealthStatus {
  ok: boolean;
  message?: string;
  checkedAt?: Date;
}

export interface ConnectorAdapter {
  kind: ConnectorKind;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  pull(): Promise<SyncResult>;
  push(items: SyncItem[]): Promise<SyncResult>;
  healthCheck(): Promise<HealthStatus>;
}
