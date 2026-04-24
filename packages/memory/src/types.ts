import type { MemoryEntry } from "@fulcrum/shared";

export interface MemoryImportInput {
  projectId: string;
  path: string;
  backend?: string;
}

export interface MemorySearchInput {
  projectId: string;
  query: string;
  limit?: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  rank: number;
  reason: string;
  limitation?: string;
}

export interface MemoryAdapter {
  readonly backend: string;
  import(input: MemoryImportInput): Promise<MemoryEntry[]>;
  search(input: MemorySearchInput, entries: MemoryEntry[]): Promise<MemorySearchResult[]>;
  health(): {
    state: "managed" | "degraded";
    nextAction?: string;
    limitation?: string;
  };
}
