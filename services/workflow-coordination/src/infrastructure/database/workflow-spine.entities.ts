import { EntitySchema } from "typeorm";

export interface FulcrumWorkspace {
  id: string;
  slug: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumProject {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description?: string | null;
  status?: string;
  ownerId?: string | null;
  traceId: string;
  methodology: string;
  workflowConfig: Record<string, unknown> | null;
  enabledTaskTypes: string[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumTask {
  id: string;
  projectId: string;
  externalId: string | null;
  title: string;
  description: string | null;
  descriptionText: string | null;
  tiptapContent: Record<string, unknown>;
  status: string;
  priority: number | null;
  points: number | null;
  assigneeId: string | null;
  parentTaskId: string | null;
  successCriteria: string[];
  customFields: Record<string, unknown>;
  traceId: string;
  deletedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumTaskDependency {
  id: string;
  projectId: string;
  taskId: string;
  dependsOnTaskId: string;
  dependencyKind: string;
  traceId: string;
  createdAt?: Date;
}

export interface FulcrumDocument {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  bodyMd: string;
  sourceType: string;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumAcpSession {
  id: string;
  projectId: string | null;
  traceId: string;
  agentName: string;
  mode: string;
  model: string | null;
  status: string;
  trafficLog: unknown[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumAgentRun {
  id: string;
  projectId: string;
  taskId: string | null;
  traceId: string;
  status: string;
  dependencyTree: string[];
  createdAt?: Date;
  updatedAt?: Date;
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

export const FulcrumWorkspaceEntity = new EntitySchema<FulcrumWorkspace>({
  name: "FulcrumWorkspace",
  tableName: "fulcrum_workspaces",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    slug: { type: "varchar", length: 160, unique: true },
    name: { type: "varchar", length: 240 },
    ...timestampColumns,
  },
});

export const FulcrumProjectEntity = new EntitySchema<FulcrumProject>({
  name: "FulcrumProject",
  tableName: "fulcrum_projects",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    workspaceId: { name: "workspace_id", type: "varchar", length: 128 },
    slug: { type: "varchar", length: 160 },
    name: { type: "varchar", length: 240 },
    description: { type: "text", nullable: true },
    status: { type: "varchar", length: 80, default: "active" },
    ownerId: { name: "owner_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    methodology: { type: "varchar", length: 32, default: "kanban" },
    workflowConfig: { name: "workflow_config", type: "jsonb", nullable: true },
    enabledTaskTypes: { name: "enabled_task_types", type: "jsonb", nullable: true },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_projects_workspace_slug_key", columns: ["workspaceId", "slug"] }],
});

export const FulcrumTaskEntity = new EntitySchema<FulcrumTask>({
  name: "FulcrumTask",
  tableName: "fulcrum_tasks",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    externalId: { name: "external_id", type: "varchar", length: 160, nullable: true },
    title: { type: "varchar", length: 320 },
    description: { type: "text", nullable: true },
    descriptionText: { name: "description_text", type: "text", nullable: true },
    tiptapContent: {
      name: "tiptap_content",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    status: { type: "varchar", length: 80 },
    priority: { type: "int", nullable: true },
    points: { type: "int", nullable: true },
    assigneeId: { name: "assignee_id", type: "varchar", length: 128, nullable: true },
    parentTaskId: { name: "parent_task_id", type: "varchar", length: 128, nullable: true },
    successCriteria: {
      name: "success_criteria",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    customFields: {
      name: "custom_fields",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    deletedAt: { name: "deleted_at", type: "timestamptz", nullable: true },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_tasks_project_status_idx", columns: ["projectId", "status"] },
    { name: "fulcrum_tasks_trace_idx", columns: ["traceId"] },
    { name: "fulcrum_tasks_project_deleted_idx", columns: ["projectId", "deletedAt"] },
    { name: "fulcrum_tasks_project_external_idx", columns: ["projectId", "externalId"], unique: true },
    { name: "fulcrum_tasks_project_parent_idx", columns: ["projectId", "parentTaskId"] },
  ],
});

export const FulcrumTaskDependencyEntity = new EntitySchema<FulcrumTaskDependency>({
  name: "FulcrumTaskDependency",
  tableName: "fulcrum_task_dependencies",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128 },
    dependsOnTaskId: { name: "depends_on_task_id", type: "varchar", length: 128 },
    dependencyKind: { name: "dependency_kind", type: "varchar", length: 80 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  uniques: [
    {
      name: "fulcrum_task_dependencies_unique_edge",
      columns: ["taskId", "dependsOnTaskId", "dependencyKind"],
    },
  ],
});

export const FulcrumDocumentEntity = new EntitySchema<FulcrumDocument>({
  name: "FulcrumDocument",
  tableName: "fulcrum_documents",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    parentId: { name: "parent_id", type: "varchar", length: 128, nullable: true },
    title: { type: "varchar", length: 320 },
    bodyMd: { name: "body_md", type: "text" },
    sourceType: { name: "source_type", type: "varchar", length: 80 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_documents_project_source_idx", columns: ["projectId", "sourceType"] },
    { name: "fulcrum_documents_project_parent_idx", columns: ["projectId", "parentId"] },
  ],
});

export const FulcrumAcpSessionEntity = new EntitySchema<FulcrumAcpSession>({
  name: "FulcrumAcpSession",
  tableName: "fulcrum_acp_sessions",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    agentName: { name: "agent_name", type: "varchar", length: 160 },
    mode: { type: "varchar", length: 80 },
    model: { type: "varchar", length: 160, nullable: true },
    status: { type: "varchar", length: 80 },
    trafficLog: {
      name: "traffic_log",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_acp_sessions_trace_idx", columns: ["traceId"] }],
});

export const FulcrumAgentRunEntity = new EntitySchema<FulcrumAgentRun>({
  name: "FulcrumAgentRun",
  tableName: "fulcrum_agent_runs",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    status: { type: "varchar", length: 80 },
    dependencyTree: {
      name: "dependency_tree",
      type: "jsonb",
      default: () => "'[]'::jsonb",
    },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_agent_runs_project_status_idx", columns: ["projectId", "status"] },
    { name: "fulcrum_agent_runs_trace_idx", columns: ["traceId"] },
  ],
});

export const FULCRUM_WORKFLOW_SPINE_ENTITIES = [
  FulcrumWorkspaceEntity,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
  FulcrumTaskDependencyEntity,
  FulcrumDocumentEntity,
  FulcrumAcpSessionEntity,
  FulcrumAgentRunEntity,
];
