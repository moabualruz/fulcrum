import { EntitySchema } from "typeorm";

export interface WorkManagementState {
  id: string;
  projectId: string;
  name: string;
  group: string;
  color: string;
  sequence: number;
  isDefault: boolean;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementLabel {
  id: string;
  projectId: string;
  name: string;
  color: string;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementTaskLabel {
  id: string;
  projectId: string;
  taskId: string;
  labelId: string;
  traceId: string;
  createdAt?: Date;
}

export interface WorkManagementCycle {
  id: string;
  projectId: string;
  name: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementCycleTask {
  id: string;
  projectId: string;
  cycleId: string;
  taskId: string;
  traceId: string;
  createdAt?: Date;
}

export interface WorkManagementModule {
  id: string;
  projectId: string;
  name: string;
  status: string;
  leadUserId: string | null;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementModuleTask {
  id: string;
  projectId: string;
  moduleId: string;
  taskId: string;
  traceId: string;
  createdAt?: Date;
}

export interface WorkManagementSavedView {
  id: string;
  projectId: string;
  name: string;
  layout: string;
  filters: Record<string, unknown>;
  groupBy: string | null;
  sortBy: string | null;
  displayProperties: Record<string, unknown>;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementIntake {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  source: string;
  taskId: string | null;
  traceId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementNotification {
  id: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  type: string;
  actorId: string | null;
  recipientId: string;
  readAt: Date | null;
  payload: Record<string, unknown>;
  traceId: string;
  createdAt?: Date;
}

export interface WorkManagementTaskComment {
  id: string;
  orgId: string;
  taskId: string;
  authorId: string;
  body: Record<string, unknown> | null;
  parentCommentId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementCommentReaction {
  id: string;
  commentId: string;
  userId: string;
  emoji: string;
  createdAt?: Date;
}

export interface WorkManagementTaskWatcher {
  id: string;
  orgId: string;
  taskId: string;
  userId: string;
  source: string;
  createdAt?: Date;
}

export interface WorkManagementTaskTemplate {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  templateData: Record<string, unknown>;
  isDefault: boolean;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementCustomFieldDef {
  id: string;
  orgId: string;
  projectId: string;
  entityType: string;
  name: string;
  slug: string;
  type: string;
  configJson: Record<string, unknown>;
  required: boolean;
  archived: boolean;
  position: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkManagementFieldDependencyRule {
  id: string;
  orgId: string;
  projectId: string;
  sourceFieldId: string;
  sourceValue: string;
  targetFieldId: string;
  action: "show" | "hide" | "require";
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

export const WorkManagementStateEntity = new EntitySchema<WorkManagementState>({
  name: "WorkManagementState",
  tableName: "fulcrum_task_states",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 160 },
    group: { name: "state_group", type: "varchar", length: 80 },
    color: { type: "varchar", length: 32 },
    sequence: { type: "int" },
    isDefault: { name: "is_default", type: "boolean", default: false },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_task_states_project_name_key", columns: ["projectId", "name"] }],
  indices: [{ name: "fulcrum_task_states_project_group_idx", columns: ["projectId", "group"] }],
});

export const WorkManagementLabelEntity = new EntitySchema<WorkManagementLabel>({
  name: "WorkManagementLabel",
  tableName: "fulcrum_task_labels",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 160 },
    color: { type: "varchar", length: 32 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_task_labels_project_name_key", columns: ["projectId", "name"] }],
});

export const WorkManagementTaskLabelEntity = new EntitySchema<WorkManagementTaskLabel>({
  name: "WorkManagementTaskLabel",
  tableName: "fulcrum_task_label_assignments",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128 },
    labelId: { name: "label_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_task_label_assignments_task_label_key", columns: ["taskId", "labelId"] }],
});

export const WorkManagementCycleEntity = new EntitySchema<WorkManagementCycle>({
  name: "WorkManagementCycle",
  tableName: "fulcrum_cycles",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 180 },
    status: { type: "varchar", length: 80 },
    startsAt: { name: "starts_at", type: "timestamptz", nullable: true },
    endsAt: { name: "ends_at", type: "timestamptz", nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_cycles_project_name_key", columns: ["projectId", "name"] }],
  indices: [{ name: "fulcrum_cycles_project_status_idx", columns: ["projectId", "status"] }],
});

export const WorkManagementCycleTaskEntity = new EntitySchema<WorkManagementCycleTask>({
  name: "WorkManagementCycleTask",
  tableName: "fulcrum_cycle_tasks",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    cycleId: { name: "cycle_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_cycle_tasks_cycle_task_key", columns: ["cycleId", "taskId"] }],
});

export const WorkManagementModuleEntity = new EntitySchema<WorkManagementModule>({
  name: "WorkManagementModule",
  tableName: "fulcrum_modules",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 180 },
    status: { type: "varchar", length: 80 },
    leadUserId: { name: "lead_user_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_modules_project_name_key", columns: ["projectId", "name"] }],
  indices: [{ name: "fulcrum_modules_project_status_idx", columns: ["projectId", "status"] }],
});

export const WorkManagementModuleTaskEntity = new EntitySchema<WorkManagementModuleTask>({
  name: "WorkManagementModuleTask",
  tableName: "fulcrum_module_tasks",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    moduleId: { name: "module_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128 },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_module_tasks_module_task_key", columns: ["moduleId", "taskId"] }],
});

export const WorkManagementSavedViewEntity = new EntitySchema<WorkManagementSavedView>({
  name: "WorkManagementSavedView",
  tableName: "fulcrum_saved_views",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 180 },
    layout: { type: "varchar", length: 80 },
    filters: { type: "jsonb", default: () => "'{}'::jsonb" },
    groupBy: { name: "group_by", type: "varchar", length: 120, nullable: true },
    sortBy: { name: "sort_by", type: "varchar", length: 120, nullable: true },
    displayProperties: {
      name: "display_properties",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_saved_views_project_layout_idx", columns: ["projectId", "layout"] }],
});

export const WorkManagementIntakeEntity = new EntitySchema<WorkManagementIntake>({
  name: "WorkManagementIntake",
  tableName: "fulcrum_intake_requests",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    title: { type: "varchar", length: 320 },
    description: { type: "text", nullable: true },
    status: { type: "varchar", length: 80 },
    source: { type: "varchar", length: 80 },
    taskId: { name: "task_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...timestampColumns,
  },
  indices: [{ name: "fulcrum_intake_requests_project_status_idx", columns: ["projectId", "status"] }],
});

export const WorkManagementNotificationEntity = new EntitySchema<WorkManagementNotification>({
  name: "WorkManagementNotification",
  tableName: "fulcrum_notifications",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    workspaceId: { name: "workspace_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    taskId: { name: "task_id", type: "varchar", length: 128, nullable: true },
    type: { type: "varchar", length: 120 },
    actorId: { name: "actor_id", type: "varchar", length: 128, nullable: true },
    recipientId: { name: "recipient_id", type: "varchar", length: 128 },
    readAt: { name: "read_at", type: "timestamptz", nullable: true },
    payload: { type: "jsonb", default: () => "'{}'::jsonb" },
    traceId: { name: "trace_id", type: "varchar", length: 160 },
    ...createdAtColumn,
  },
  indices: [
    { name: "fulcrum_notifications_recipient_read_idx", columns: ["recipientId", "readAt"] },
    { name: "fulcrum_notifications_trace_idx", columns: ["traceId"] },
  ],
});

export const WorkManagementTaskCommentEntity = new EntitySchema<WorkManagementTaskComment>({
  name: "WorkManagementTaskComment",
  tableName: "fulcrum_task_comments",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128 },
    authorId: { name: "author_id", type: "varchar", length: 128 },
    body: { type: "jsonb", nullable: true },
    parentCommentId: { name: "parent_comment_id", type: "varchar", length: 128, nullable: true },
    resolved: { type: "boolean", default: false },
    resolvedBy: { name: "resolved_by", type: "varchar", length: 128, nullable: true },
    resolvedAt: { name: "resolved_at", type: "timestamptz", nullable: true },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_task_comments_task_idx", columns: ["taskId"] },
    { name: "fulcrum_task_comments_org_task_idx", columns: ["orgId", "taskId"] },
    { name: "fulcrum_task_comments_parent_idx", columns: ["parentCommentId"] },
  ],
});

export const WorkManagementCommentReactionEntity = new EntitySchema<WorkManagementCommentReaction>({
  name: "WorkManagementCommentReaction",
  tableName: "fulcrum_comment_reactions",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    commentId: { name: "comment_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128 },
    emoji: { type: "varchar", length: 32 },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_comment_reactions_unique_user_emoji", columns: ["commentId", "userId", "emoji"] }],
});

export const WorkManagementTaskWatcherEntity = new EntitySchema<WorkManagementTaskWatcher>({
  name: "WorkManagementTaskWatcher",
  tableName: "fulcrum_task_watchers",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    taskId: { name: "task_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128 },
    source: { type: "varchar", length: 80, default: "manual" },
    ...createdAtColumn,
  },
  uniques: [{ name: "fulcrum_task_watchers_task_user_key", columns: ["taskId", "userId"] }],
  indices: [{ name: "fulcrum_task_watchers_org_task_idx", columns: ["orgId", "taskId"] }],
});

export const WorkManagementTaskTemplateEntity = new EntitySchema<WorkManagementTaskTemplate>({
  name: "WorkManagementTaskTemplate",
  tableName: "fulcrum_task_templates",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    name: { type: "varchar", length: 220 },
    description: { type: "text", nullable: true },
    templateData: {
      name: "template_data",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    isDefault: { name: "is_default", type: "boolean", default: false },
    createdBy: { name: "created_by", type: "varchar", length: 128 },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_task_templates_org_project_idx", columns: ["orgId", "projectId"] },
    { name: "fulcrum_task_templates_org_default_idx", columns: ["orgId", "projectId", "isDefault"] },
  ],
});

export const WorkManagementCustomFieldDefEntity = new EntitySchema<WorkManagementCustomFieldDef>({
  name: "WorkManagementCustomFieldDef",
  tableName: "fulcrum_custom_field_defs",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    entityType: { name: "entity_type", type: "varchar", length: 80, default: "task" },
    name: { type: "varchar", length: 180 },
    slug: { type: "varchar", length: 180 },
    type: { type: "varchar", length: 80 },
    configJson: {
      name: "config_json",
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    required: { type: "boolean", default: false },
    archived: { type: "boolean", default: false },
    position: { type: "int", default: 0 },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_custom_field_defs_project_slug_key", columns: ["projectId", "slug"] }],
  indices: [
    { name: "fulcrum_custom_field_defs_org_project_idx", columns: ["orgId", "projectId"] },
    { name: "fulcrum_custom_field_defs_project_position_idx", columns: ["projectId", "position"] },
  ],
});

export const WorkManagementFieldDependencyRuleEntity = new EntitySchema<WorkManagementFieldDependencyRule>({
  name: "WorkManagementFieldDependencyRule",
  tableName: "fulcrum_field_dependency_rules",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128 },
    sourceFieldId: { name: "source_field_id", type: "varchar", length: 180 },
    sourceValue: { name: "source_value", type: "varchar", length: 320 },
    targetFieldId: { name: "target_field_id", type: "varchar", length: 180 },
    action: { type: "varchar", length: 40 },
    ...createdAtColumn,
  },
  indices: [
    { name: "fulcrum_field_dependency_rules_org_project_idx", columns: ["orgId", "projectId"] },
    { name: "fulcrum_field_dependency_rules_project_source_idx", columns: ["projectId", "sourceFieldId"] },
  ],
});

export const WORK_MANAGEMENT_ENTITIES = [
  WorkManagementStateEntity,
  WorkManagementLabelEntity,
  WorkManagementTaskLabelEntity,
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
  WorkManagementModuleEntity,
  WorkManagementModuleTaskEntity,
  WorkManagementSavedViewEntity,
  WorkManagementIntakeEntity,
  WorkManagementNotificationEntity,
  WorkManagementTaskCommentEntity,
  WorkManagementCommentReactionEntity,
  WorkManagementTaskWatcherEntity,
  WorkManagementTaskTemplateEntity,
  WorkManagementCustomFieldDefEntity,
  WorkManagementFieldDependencyRuleEntity,
];
