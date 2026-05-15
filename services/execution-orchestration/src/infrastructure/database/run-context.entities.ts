import { EntitySchema } from "typeorm";

export interface FulcrumContextBundle {
  id: string;
  projectId: string;
  traceId: string;
  taskId: string | null;
  runId: string | null;
  purpose: string;
  sourceRefs: Array<Record<string, unknown>>;
  bundleJson: Record<string, unknown>;
  tokenCount: number;
  sourceCounts: Record<string, number>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumMemory {
  id: string;
  projectId: string | null;
  traceId: string;
  scope: string;
  kind: string;
  body: string;
  tags: string[];
  importance: string;
  source: string;
  sourceRef: Record<string, unknown>;
  archived: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumMemoryLink {
  id: string;
  projectId: string | null;
  memoryId: string;
  targetKind: string;
  targetId: string;
  traceId: string;
  createdAt?: Date;
}

export interface FulcrumRunEvent {
  id: string;
  projectId: string;
  runId: string;
  taskId: string | null;
  traceId: string;
  sequence: number;
  domain: string;
  mutationType: string;
  targetKind: string;
  targetId: string;
  agentId: string | null;
  taskLineageId: string | null;
  payload: Record<string, unknown>;
  createdAt?: Date;
}

const timestampColumns = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
  updatedAt: {
    name: "updated_at",
    type: "timestamptz",
    updateDate: true,
  },
} as const;

const createdAtColumn = {
  createdAt: {
    name: "created_at",
    type: "timestamptz",
    createDate: true,
  },
} as const;

export const FulcrumContextBundleEntity = new EntitySchema<FulcrumContextBundle>({
  name: "FulcrumContextBundle",
  tableName: "fulcrum_context_bundles",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    taskId: { name: "task_id", type: "varchar", length: 128, nullable: true },
    runId: { name: "run_id", type: "varchar", length: 128, nullable: true },
    purpose: { type: "varchar", length: 80 },
    sourceRefs: {
      name: "source_refs",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    bundleJson: {
      name: "bundle_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    tokenCount: { name: "token_count", type: "integer" },
    sourceCounts: {
      name: "source_counts",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_context_bundles_trace_idx", columns: ["traceId"] },
    { name: "fulcrum_context_bundles_run_idx", columns: ["projectId", "runId"] },
    { name: "fulcrum_context_bundles_task_idx", columns: ["projectId", "taskId"] },
  ],
});

export const FulcrumMemoryEntity = new EntitySchema<FulcrumMemory>({
  name: "FulcrumMemory",
  tableName: "fulcrum_memories",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    scope: { type: "varchar", length: 80 },
    kind: { type: "varchar", length: 80 },
    body: { type: "text" },
    tags: {
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    importance: { type: "varchar", length: 80 },
    source: { type: "varchar", length: 80 },
    sourceRef: {
      name: "source_ref",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    archived: { type: "boolean", default: false },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_memories_project_importance_idx", columns: ["projectId", "importance"] },
    { name: "fulcrum_memories_trace_idx", columns: ["traceId"] },
    { name: "fulcrum_memories_scope_kind_idx", columns: ["scope", "kind"] },
    { name: "fulcrum_memories_archived_idx", columns: ["archived"] },
  ],
});

export const FulcrumMemoryLinkEntity = new EntitySchema<FulcrumMemoryLink>({
  name: "FulcrumMemoryLink",
  tableName: "fulcrum_memory_links",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    memoryId: { name: "memory_id", type: "varchar", length: 128 },
    targetKind: { name: "target_kind", type: "varchar", length: 80 },
    targetId: { name: "target_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  uniques: [
    {
      name: "fulcrum_memory_links_memory_target_key",
      columns: ["memoryId", "targetKind", "targetId"],
    },
  ],
  indices: [
    { name: "fulcrum_memory_links_memory_idx", columns: ["memoryId"] },
    { name: "fulcrum_memory_links_target_idx", columns: ["projectId", "targetKind", "targetId"] },
    { name: "fulcrum_memory_links_trace_idx", columns: ["traceId"] },
  ],
});

export const FulcrumRunEventEntity = new EntitySchema<FulcrumRunEvent>({
  name: "FulcrumRunEvent",
  tableName: "fulcrum_run_events",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    runId: { name: "run_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    sequence: { type: "integer" },
    domain: { type: "varchar", length: 80 },
    mutationType: { name: "mutation_type", type: "varchar", length: 160 },
    targetKind: { name: "target_kind", type: "varchar", length: 80 },
    targetId: { name: "target_id", type: "varchar", length: 128 },
    agentId: { name: "agent_id", type: "varchar", length: 160, nullable: true },
    taskLineageId: { name: "task_lineage_id", type: "varchar", length: 160, nullable: true },
    payload: {
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_run_events_run_sequence_key", columns: ["runId", "sequence"] }],
  indices: [
    { name: "fulcrum_run_events_project_trace_idx", columns: ["projectId", "traceId"] },
    { name: "fulcrum_run_events_run_idx", columns: ["runId", "sequence"] },
    { name: "fulcrum_run_events_task_idx", columns: ["projectId", "taskId"] },
  ],
});

export const FULCRUM_CONTEXT_MEMORY_RUN_EVENT_ENTITIES = [
  FulcrumContextBundleEntity,
  FulcrumMemoryEntity,
  FulcrumMemoryLinkEntity,
  FulcrumRunEventEntity,
];
