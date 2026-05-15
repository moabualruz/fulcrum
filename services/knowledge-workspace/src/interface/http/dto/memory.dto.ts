export const MEMORY_KINDS = [
  "note",
  "decision",
  "blocker",
  "file_ref",
  "section_anchor",
  "link",
  "fact",
] as const;
export const MEMORY_IMPORTANCE = ["low", "medium", "high"] as const;
export const MEMORY_SOURCE = ["heuristic", "llm", "manual"] as const;

export type PublicMemoryKind = (typeof MEMORY_KINDS)[number];
export type PublicMemoryImportance = (typeof MEMORY_IMPORTANCE)[number];
export type PublicMemorySource = (typeof MEMORY_SOURCE)[number];

export class MemoryListQueryDto {
  projectId?: string;
  global?: boolean | string;
  kind?: PublicMemoryKind;
  tags?: string;
  importance?: PublicMemoryImportance;
  archived?: boolean | string;
  source?: PublicMemorySource;
  limit?: number | string;
  offset?: number | string;
}

export class CreateMemoryBodyDto {
  projectId?: string | null;
  global?: boolean;
  kind?: PublicMemoryKind;
  body!: string;
  tags?: string[];
  importance?: PublicMemoryImportance;
  source?: "manual";
  sourceRef?: Record<string, unknown>;
}

export class MemorySearchQueryDto extends MemoryListQueryDto {
  query!: string;
}

export class MemoryPatchBodyDto {
  body?: string;
  tags?: string[];
  importance?: PublicMemoryImportance;
  forceEdit?: boolean;
}

export class MemoryIdParamsDto {
  id!: string;
}

export class MemoryDeleteQueryDto {
  confirm?: string;
}

export class MemoryDigestBodyDto {
  projectId!: string;
  since?: string;
}

export class ContextPreviewQueryDto {
  taskId!: string;
  budget?: number | string;
  includeGlobal?: boolean | string;
}
