import type { MemoryImportance, MemoryKind, MemorySource } from "../../db/entities/memory/enums.ts";

export interface MemoryApplicationContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface MemoryDto {
  id: string;
  orgId: string;
  projectId: string | null;
  global: boolean;
  kind: MemoryKind;
  body: string;
  tags: string[];
  importance: MemoryImportance;
  source: MemorySource;
  sourceRef: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
}

export interface RankedMemoryDto extends MemoryDto {
  textRank: number;
  recencyBoost: number;
  importanceBoost: number;
  score: number;
}

export interface CreateMemoryInput {
  projectId?: string | null;
  global?: boolean;
  kind?: MemoryKind;
  body: string;
  tags?: string[];
  importance?: MemoryImportance;
  source?: "manual";
  sourceRef?: Record<string, unknown>;
}

export interface ListMemoriesInput {
  projectId?: string | null;
  global?: boolean;
  kind?: MemoryKind;
  tags?: string[];
  importance?: MemoryImportance;
  archived?: boolean;
  source?: MemorySource;
  limit?: number;
  offset?: number;
}

export interface UpdateMemoryInput {
  id: string;
  body?: string;
  tags?: string[];
  importance?: MemoryImportance;
  forceEdit?: boolean;
}

export interface SearchMemoryInput extends ListMemoriesInput {
  query: string;
  topK?: number;
  now?: string;
}
