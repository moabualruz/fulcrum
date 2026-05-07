export const MEMORY_KINDS = ["note", "decision", "preference", "fact", "constraint", "pattern"] as const;
export const MEMORY_IMPORTANCE = ["low", "medium", "high"] as const;
export const MEMORY_SOURCES = ["manual", "heuristic", "llm"] as const;

export type MemoryKind = typeof MEMORY_KINDS[number];
export type MemoryImportance = typeof MEMORY_IMPORTANCE[number];
export type MemorySource = typeof MEMORY_SOURCES[number];

export interface MemoryRow {
  id: string;
  projectId: string | null;
  global: boolean;
  kind: MemoryKind;
  body: string;
  tags: string[];
  importance: MemoryImportance;
  source: MemorySource;
  sourceRef: Record<string, unknown>;
  createdAt: string | Date;
  updatedAt: string | Date;
  archived: boolean;
  textRank?: number;
  recencyBoost?: number;
  importanceBoost?: number;
  score?: number;
  links?: MemoryLink[];
}

export interface MemoryLink {
  targetKind: "task" | "doc" | "agent_run" | "artifact";
  targetId: string;
  label?: string;
}

export interface MemoryFilterState {
  projectId?: string;
  kind?: string;
  importance?: string;
  tags?: string;
  source?: string;
  archived?: boolean;
  dateRange?: string;
}

export interface MemoryListInput {
  projectId?: string;
  kind?: MemoryKind;
  importance?: MemoryImportance;
  tags?: string[];
  source?: MemorySource;
  archived: boolean;
  limit: number;
}

export interface MemoryConfig {
  bm25_weight: number;
  recency_weight: number;
  importance_boost: number;
  token_budget: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  bm25_weight: 1,
  recency_weight: 1,
  importance_boost: 1,
  token_budget: 4096,
};

export function buildMemoryListInput(filters: MemoryFilterState): MemoryListInput {
  const input: MemoryListInput = {
    archived: filters.archived ?? false,
    limit: 50,
  };
  const tags = parseTags(filters.tags ?? "");

  if (filters.projectId) input.projectId = filters.projectId;
  if (isMemoryKind(filters.kind)) input.kind = filters.kind;
  if (isMemoryImportance(filters.importance)) input.importance = filters.importance;
  if (isMemorySource(filters.source)) input.source = filters.source;
  if (tags.length > 0) input.tags = tags;

  return input;
}

export function createDebouncedMemorySearch<TInput>(
  search: (input: TInput) => void,
  delayMs = 300,
): (input: TInput) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (input: TInput) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => search(input), delayMs);
  };
}

export function shouldConfirmMetadataEdit(source: MemorySource): boolean {
  return source !== "manual";
}

export function optimisticMemoryAction<TMemory extends Pick<MemoryRow, "archived" | "global" | "importance" | "tags">>(
  memory: TMemory,
  action: "promote" | "archive" | "restore" | "tag",
  tag?: string,
): TMemory {
  if (action === "promote") return { ...memory, global: true, importance: "high" };
  if (action === "archive") return { ...memory, archived: true };
  if (action === "restore") return { ...memory, archived: false };
  const nextTag = (tag ?? "").trim();
  if (!nextTag || memory.tags.includes(nextTag)) return memory;
  return { ...memory, tags: [...memory.tags, nextTag] };
}

export function scoreMemoryForConfig(
  row: Pick<MemoryRow, "textRank" | "recencyBoost" | "importanceBoost">,
  config: MemoryConfig,
): number {
  return (row.textRank ?? 0) * config.bm25_weight +
    (row.recencyBoost ?? 0) * config.recency_weight +
    (row.importanceBoost ?? 0) * config.importance_boost;
}

export function buildMemorySourceHref(sourceRef: Record<string, unknown>): string | null {
  if (typeof sourceRef["run_id"] === "string") return `/runs/${sourceRef["run_id"]}`;
  if (typeof sourceRef["doc_id"] === "string") return `/docs/${sourceRef["doc_id"]}`;
  if (typeof sourceRef["task_id"] === "string") return `/tasks/${sourceRef["task_id"]}`;
  if (typeof sourceRef["artifact_id"] === "string") return `/artifacts/${sourceRef["artifact_id"]}`;
  return null;
}

export function previewMemory(body: string, limit = 180): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function normalizeMemoryConfig(value: Partial<MemoryConfig> | null | undefined): MemoryConfig {
  return {
    bm25_weight: numberOrDefault(value?.bm25_weight, DEFAULT_MEMORY_CONFIG.bm25_weight),
    recency_weight: numberOrDefault(value?.recency_weight, DEFAULT_MEMORY_CONFIG.recency_weight),
    importance_boost: numberOrDefault(value?.importance_boost, DEFAULT_MEMORY_CONFIG.importance_boost),
    token_budget: Math.round(numberOrDefault(value?.token_budget, DEFAULT_MEMORY_CONFIG.token_budget)),
  };
}

function parseTags(input: string): string[] {
  return input.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value);
}

function isMemoryImportance(value: unknown): value is MemoryImportance {
  return typeof value === "string" && (MEMORY_IMPORTANCE as readonly string[]).includes(value);
}

function isMemorySource(value: unknown): value is MemorySource {
  return typeof value === "string" && (MEMORY_SOURCES as readonly string[]).includes(value);
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
