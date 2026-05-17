import { randomUUID } from "node:crypto";
import { DataSource, In, IsNull, type FindOptionsWhere } from "typeorm";

import {
  TASK_STATE_GROUP_ORDER,
  TASK_STATE_GROUPS,
  TASK_VIEW_ACCESS_SPECIFIERS,
  countTaskViewFilters,
  shouldRenderTaskColumn,
  type TaskStateGroup,
} from "@work-management/application/task-view-filtering.ts";
import {
  WorkManagementCycleTaskEntity,
  WorkManagementLabelEntity,
  WorkManagementModuleTaskEntity,
  WorkManagementStateEntity,
  WorkManagementTaskLabelEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  exportTasksCsv,
  importTasksCsv,
  type CsvImportResult,
  type CsvTask,
} from "@integration-hub/application/external-connectors/csv.ts";
import {
  type FulcrumProject,
  type FulcrumTask,
  type FulcrumTaskDependency,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";

interface TaskScope {
  orgId: string;
  projectId: string | null;
}

export interface TaskPublicRow {
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
  parentId: string | null;
  successCriteria: string[];
  traceId: string;
  deletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskPublicDependencies {
  blocks: string[];
  blocked_by: string[];
}

export type TaskPublicWorkbenchViewMode = "board" | "list" | "table";
export type TaskPublicWorkbenchLayout = "kanban" | "list" | "spreadsheet";

export interface TaskPublicWorkbenchFilters {
  statuses?: string[];
  stateGroups?: TaskStateGroup[];
  labels?: string[];
  assigneeIds?: string[];
  cycleIds?: string[];
  moduleIds?: string[];
  taskTypes?: string[];
  priorities?: number[];
  search?: string;
}

export interface TaskPublicWorkbenchInput {
  traceId?: string;
  viewMode?: TaskPublicWorkbenchViewMode;
  filters?: TaskPublicWorkbenchFilters;
  projectCapabilities?: {
    estimateEnabled?: boolean;
  };
}

interface TaskPublicWorkbenchRow {
  id: string;
  traceId?: string;
  projectId: string | null;
  title: string;
  status: string | null;
  stateGroup: TaskStateGroup;
  stateLabel: string;
  priority: number | null;
  points: number | null;
  assigneeId: string | null;
  labels: string[];
  taskType: string;
  cycleId: string | null;
  moduleId: string | null;
  parentId: string | null;
  dependencyIds: string[];
  updatedAt: string;
}

export class TaskPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async listTasks(input: TaskScope & {
    includeDeleted?: boolean;
  }): Promise<TaskPublicRow[]> {
    const projectIds = await this.resolveProjectIds(input);
    if (projectIds.length === 0) return [];

    const where: FindOptionsWhere<FulcrumTask> = {
      projectId: projectIds.length === 1 ? projectIds[0] : undefined,
      deletedAt: input.includeDeleted ? undefined : IsNull(),
    };
    const tasks = projectIds.length === 1
      ? await this.taskRepository().find({ where, order: { createdAt: "ASC", id: "ASC" } })
      : await this.taskRepository()
        .createQueryBuilder("task")
        .where("task.project_id IN (:...projectIds)", { projectIds })
        .andWhere(input.includeDeleted ? "1 = 1" : "task.deleted_at IS NULL")
        .orderBy("task.created_at", "ASC")
        .addOrderBy("task.id", "ASC")
        .getMany();

    return tasks.map(toPublicRow);
  }

  async createTask(input: TaskScope & {
    title: string;
    description: string | null;
    descriptionText?: string;
    tiptapContent?: unknown;
    status?: TaskStatus;
    priority?: number;
    points?: number;
    assigneeId?: string;
  }): Promise<TaskPublicRow | null> {
    const project = await this.resolveProject(input);
    if (!project) return null;

    const id = randomUUID();
    const task = await this.taskRepository().save({
      id,
      projectId: project.id,
      externalId: null,
      title: input.title,
      description: input.description,
      descriptionText: input.descriptionText ?? input.description,
      tiptapContent: objectValue(input.tiptapContent),
      status: input.status ?? "todo",
      priority: input.priority ?? null,
      points: input.points ?? null,
      assigneeId: input.assigneeId ?? null,
      parentTaskId: null,
      successCriteria: [],
      traceId: `trace-task-${id}`,
      deletedAt: null,
    });

    return toPublicRow(task);
  }

  async getTask(input: TaskScope & {
    id: string;
  }): Promise<TaskPublicRow | null> {
    const task = await this.findScopedTask(input);
    return task ? toPublicRow(task) : null;
  }

  async patchTask(input: TaskScope & {
    id: string;
    title?: string;
    description?: string | null;
    descriptionText?: string;
    tiptapContent?: unknown;
    status?: TaskStatus;
    priority?: number;
    points?: number;
    assigneeId?: string;
  }): Promise<TaskPublicRow | null> {
    const task = await this.findScopedTask(input);
    if (!task) return null;

    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.descriptionText !== undefined) task.descriptionText = input.descriptionText;
    if (input.tiptapContent !== undefined) task.tiptapContent = objectValue(input.tiptapContent);
    if (input.status !== undefined) task.status = input.status;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.points !== undefined) task.points = input.points;
    if (input.assigneeId !== undefined) task.assigneeId = input.assigneeId;

    return toPublicRow(await this.taskRepository().save(task));
  }

  async listTaskChildren(input: TaskScope & {
    id: string;
  }): Promise<TaskPublicRow[] | null> {
    const task = await this.findScopedTask(input);
    if (!task) return null;

    const children = await this.taskRepository().find({
      where: { projectId: task.projectId, parentTaskId: task.id, deletedAt: IsNull() },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return children.map(toPublicRow);
  }

  async setTaskParent(input: TaskScope & {
    id: string;
    parentId?: string | null;
  }): Promise<TaskPublicRow | null> {
    const task = await this.findScopedTask(input);
    if (!task) return null;

    const parentId = input.parentId?.trim() || null;
    if (parentId === task.id) {
      throw new Error("Task parent cycle rejected.");
    }

    if (parentId) {
      const parent = await this.findScopedTask({ ...input, id: parentId, projectId: task.projectId });
      if (!parent || parent.projectId !== task.projectId) {
        throw new Error("Task parent was not found.");
      }
      await this.assertParentChangeDoesNotCycle(task, parent.id);
    }

    task.parentTaskId = parentId;
    return toPublicRow(await this.taskRepository().save(task));
  }

  async buildManualWorkbench(input: TaskScope & TaskPublicWorkbenchInput): Promise<{
    projectId: string | null;
    traceId?: string;
    viewMode: TaskPublicWorkbenchViewMode;
    layout: TaskPublicWorkbenchLayout;
    filtersApplied: number;
    accessSpecifiers: Array<{ key: "PUBLIC" | "PRIVATE"; i18nLabel: string }>;
    columns: Array<{ group: TaskStateGroup; label: string; color: string; taskIds: string[]; count: number }>;
    listRows: TaskPublicWorkbenchRow[];
    table: {
      visibleColumns: Array<{ key: string; label: string }>;
      rows: Array<{ id: string; traceId?: string; cells: Record<string, string | number | null> }>;
    };
    emptyState: { allTasksEmpty: boolean; visibleTasksEmpty: boolean; message: string };
  }> {
    const tasks = await this.listTasks({ ...input, includeDeleted: false });
    const relations = await this.loadWorkbenchRelations(tasks);
    const filters = normalizeWorkbenchFilters(input.filters);
    const rows = tasks.map((task) => taskToWorkbenchRow(task, relations, input.traceId));
    const visibleRows = rows.filter((row) => rowMatchesWorkbenchFilters(row, filters));
    const visibleColumns = buildWorkbenchTableColumns(input.projectCapabilities);
    const viewMode = input.viewMode ?? "board";

    return {
      projectId: input.projectId,
      traceId: input.traceId,
      viewMode,
      layout: workbenchLayoutFor(viewMode),
      filtersApplied: countTaskViewFilters({ ...filters }),
      accessSpecifiers: [...TASK_VIEW_ACCESS_SPECIFIERS],
      columns: buildWorkbenchColumns(visibleRows),
      listRows: visibleRows,
      table: {
        visibleColumns,
        rows: visibleRows.map((row) => workbenchTableRowFor(row, visibleColumns)),
      },
      emptyState: {
        allTasksEmpty: rows.length === 0,
        visibleTasksEmpty: visibleRows.length === 0,
        message: rows.length === 0
          ? "No work items in this project."
          : visibleRows.length === 0
            ? "No work items match the current task filters."
            : "",
      },
    };
  }

  async deleteTask(input: TaskScope & {
    id: string;
  }): Promise<TaskPublicRow | null> {
    const task = await this.findScopedTask(input);
    if (!task) return null;

    task.deletedAt = new Date();
    return toPublicRow(await this.taskRepository().save(task));
  }

  async setTaskDependencies(input: TaskScope & {
    id: string;
    blocks?: string[];
    blocked_by?: string[];
  }): Promise<{ id: string; projectId: string; dependencies: TaskPublicDependencies } | null> {
    const task = await this.findScopedTask(input);
    if (!task) return null;

    const dependencies = {
      blocks: normalizedUnique(input.blocks ?? []),
      blocked_by: normalizedUnique(input.blocked_by ?? []),
    };
    const referencedIds = new Set([...dependencies.blocks, ...dependencies.blocked_by]);
    if (referencedIds.has(task.id)) {
      throw new Error("Task dependency cycle rejected.");
    }

    const projectTasks = await this.taskRepository().find({
      where: { projectId: task.projectId, deletedAt: IsNull() },
    });
    const knownTaskIds = new Set(projectTasks.map((candidate) => candidate.id));
    if ([...referencedIds].some((id) => !knownTaskIds.has(id))) {
      throw new Error("One or more tasks were not found.");
    }

    const existingEdges = await this.dependencyRepository().find({
      where: { projectId: task.projectId },
    });
    const retainedEdges = existingEdges.filter((edge) =>
      edge.taskId !== task.id && edge.dependsOnTaskId !== task.id
    );
    const nextEdges: FulcrumTaskDependency[] = [
      ...retainedEdges,
      ...dependencies.blocked_by.map((dependsOnTaskId) => dependencyEdge(task.projectId, task.id, dependsOnTaskId)),
      ...dependencies.blocks.map((blockedTaskId) => dependencyEdge(task.projectId, blockedTaskId, task.id)),
    ];
    assertNoDependencyCycle(nextEdges);

    await this.dataSource.transaction(async (manager) => {
      await manager.createQueryBuilder()
        .delete()
        .from(FulcrumTaskDependencyEntity)
        .where("project_id = :projectId", { projectId: task.projectId })
        .andWhere("(task_id = :taskId OR depends_on_task_id = :taskId)", { taskId: task.id })
        .execute();
      if (nextEdges.length > retainedEdges.length) {
        await manager.getRepository(FulcrumTaskDependencyEntity).save(nextEdges.slice(retainedEdges.length));
      }
    });

    return {
      id: task.id,
      projectId: task.projectId,
      dependencies,
    };
  }

  async exportTasks(input: { projectId: string }): Promise<string> {
    const tasks = await this.taskRepository().find({
      where: { projectId: input.projectId, deletedAt: IsNull() },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return exportTasksCsv(tasks.map(toCsvTask));
  }

  async importTasks(input: { projectId: string; csv: string }): Promise<CsvImportResult> {
    const projectExists = await this.dataSource.getRepository(FulcrumProjectEntity).existsBy({
      id: input.projectId,
    });
    if (!projectExists) return { created: 0, skipped: 0, errors: [] };

    const existingExternalIds = new Set(
      (await this.taskRepository().find({
        select: { externalId: true },
        where: { projectId: input.projectId },
      }))
        .map((task) => task.externalId)
        .filter((externalId): externalId is string => typeof externalId === "string" && externalId.length > 0),
    );
    const rowsToCreate: Array<{ externalId?: string; title: string; status?: string }> = [];

    const result = importTasksCsv(
      input.csv,
      (row) => {
        if (row.externalId) existingExternalIds.add(row.externalId);
        rowsToCreate.push(row);
      },
      (externalId) => existingExternalIds.has(externalId),
    );

    if (rowsToCreate.length > 0) {
      await this.taskRepository().save(rowsToCreate.map((row) => {
        const id = randomUUID();
        return {
          id,
          projectId: input.projectId,
          externalId: row.externalId ?? null,
          title: row.title,
          description: null,
          descriptionText: null,
          tiptapContent: {},
          status: row.status ?? "todo",
          priority: null,
          points: null,
          assigneeId: null,
          successCriteria: [],
          traceId: `trace-task-${id}`,
          deletedAt: null,
        };
      }));
    }

    return result;
  }

  private async findScopedTask(input: TaskScope & { id: string }): Promise<FulcrumTask | null> {
    const projectIds = await this.resolveProjectIds(input);
    if (projectIds.length === 0) return null;

    return await this.taskRepository()
      .createQueryBuilder("task")
      .where("task.id = :id", { id: input.id })
      .andWhere("task.project_id IN (:...projectIds)", { projectIds })
      .andWhere("task.deleted_at IS NULL")
      .getOne();
  }

  private async resolveProject(input: TaskScope): Promise<FulcrumProject | null> {
    if (!input.projectId) return null;
    return await this.dataSource.getRepository(FulcrumProjectEntity).findOneBy({
      id: input.projectId,
      workspaceId: input.orgId,
    });
  }

  private async resolveProjectIds(input: TaskScope): Promise<string[]> {
    if (input.projectId) {
      const project = await this.resolveProject(input);
      return project ? [project.id] : [];
    }

    const projects = await this.dataSource.getRepository(FulcrumProjectEntity).findBy({
      workspaceId: input.orgId,
    });
    return projects.map((project) => project.id);
  }

  private taskRepository() {
    return this.dataSource.getRepository(FulcrumTaskEntity);
  }

  private dependencyRepository() {
    return this.dataSource.getRepository(FulcrumTaskDependencyEntity);
  }

  private async loadWorkbenchRelations(tasks: TaskPublicRow[]): Promise<TaskWorkbenchRelations> {
    if (tasks.length === 0) return emptyWorkbenchRelations();

    const taskIds = tasks.map((task) => task.id);
    const projectIds = [...new Set(tasks.map((task) => task.projectId))];
    const [states, labels, taskLabels, cycleTasks, moduleTasks, dependencies] = await Promise.all([
      this.dataSource.getRepository(WorkManagementStateEntity).find({ where: { projectId: In(projectIds) } }),
      this.dataSource.getRepository(WorkManagementLabelEntity).find({ where: { projectId: In(projectIds) } }),
      this.dataSource.getRepository(WorkManagementTaskLabelEntity).find({ where: { taskId: In(taskIds) } }),
      this.dataSource.getRepository(WorkManagementCycleTaskEntity).find({ where: { taskId: In(taskIds) } }),
      this.dataSource.getRepository(WorkManagementModuleTaskEntity).find({ where: { taskId: In(taskIds) } }),
      this.dependencyRepository().find({ where: { taskId: In(taskIds) } }),
    ]);
    const labelById = new Map(labels.map((label) => [label.id, label.name]));
    const labelsByTaskId = new Map<string, string[]>();
    for (const assignment of taskLabels) {
      const label = labelById.get(assignment.labelId);
      if (label) labelsByTaskId.set(assignment.taskId, [...(labelsByTaskId.get(assignment.taskId) ?? []), label]);
    }
    const dependencyIdsByTaskId = new Map<string, string[]>();
    for (const edge of dependencies) {
      dependencyIdsByTaskId.set(edge.taskId, [
        ...(dependencyIdsByTaskId.get(edge.taskId) ?? []),
        edge.dependsOnTaskId,
      ]);
    }
    return {
      stateByProjectAndName: new Map(states.map((state) => [`${state.projectId}:${normalizedKey(state.name)}`, state])),
      stateByProjectAndId: new Map(states.map((state) => [`${state.projectId}:${state.id}`, state])),
      labelsByTaskId,
      cycleIdByTaskId: new Map(cycleTasks.map((assignment) => [assignment.taskId, assignment.cycleId])),
      moduleIdByTaskId: new Map(moduleTasks.map((assignment) => [assignment.taskId, assignment.moduleId])),
      dependencyIdsByTaskId,
    };
  }

  private async assertParentChangeDoesNotCycle(task: FulcrumTask, parentId: string): Promise<void> {
    const projectTasks = await this.taskRepository().find({
      where: { projectId: task.projectId, deletedAt: IsNull() },
    });
    const parentById = new Map(projectTasks.map((candidate) => [candidate.id, candidate.parentTaskId]));
    const seen = new Set<string>();
    let currentId: string | null = parentId;
    while (currentId) {
      if (currentId === task.id || seen.has(currentId)) {
        throw new Error("Task parent cycle rejected.");
      }
      seen.add(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }
}

interface TaskWorkbenchRelations {
  stateByProjectAndName: Map<string, { id: string; name: string; group: string; color: string }>;
  stateByProjectAndId: Map<string, { id: string; name: string; group: string; color: string }>;
  labelsByTaskId: Map<string, string[]>;
  cycleIdByTaskId: Map<string, string>;
  moduleIdByTaskId: Map<string, string>;
  dependencyIdsByTaskId: Map<string, string[]>;
}

function emptyWorkbenchRelations(): TaskWorkbenchRelations {
  return {
    stateByProjectAndName: new Map(),
    stateByProjectAndId: new Map(),
    labelsByTaskId: new Map(),
    cycleIdByTaskId: new Map(),
    moduleIdByTaskId: new Map(),
    dependencyIdsByTaskId: new Map(),
  };
}

function taskToWorkbenchRow(
  task: TaskPublicRow,
  relations: TaskWorkbenchRelations,
  traceId: string | undefined,
): TaskPublicWorkbenchRow {
  const state = relations.stateByProjectAndId.get(`${task.projectId}:${task.status}`) ??
    relations.stateByProjectAndName.get(`${task.projectId}:${normalizedKey(task.status)}`);
  const stateGroup = normalizeTaskStateGroup(state?.group) ?? mapTaskStatusToStateGroup(task.status);
  return {
    id: task.id,
    traceId,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    stateGroup,
    stateLabel: state?.name ?? TASK_STATE_GROUPS[stateGroup].label,
    priority: task.priority,
    points: task.points,
    assigneeId: task.assigneeId,
    labels: relations.labelsByTaskId.get(task.id) ?? [],
    taskType: "task",
    cycleId: relations.cycleIdByTaskId.get(task.id) ?? null,
    moduleId: relations.moduleIdByTaskId.get(task.id) ?? null,
    parentId: task.parentId,
    dependencyIds: relations.dependencyIdsByTaskId.get(task.id) ?? [],
    updatedAt: task.updatedAt ?? task.createdAt ?? "",
  };
}

function normalizeWorkbenchFilters(filters: TaskPublicWorkbenchFilters | undefined): TaskPublicWorkbenchFilters {
  if (!filters) return {};
  return {
    statuses: normalizedStringList(filters.statuses),
    stateGroups: filters.stateGroups?.filter((group): group is TaskStateGroup => TASK_STATE_GROUP_ORDER.includes(group)),
    labels: normalizedStringList(filters.labels),
    assigneeIds: normalizedStringList(filters.assigneeIds),
    cycleIds: normalizedStringList(filters.cycleIds),
    moduleIds: normalizedStringList(filters.moduleIds),
    taskTypes: normalizedStringList(filters.taskTypes),
    priorities: filters.priorities?.filter((value) => Number.isInteger(value)),
    search: filters.search?.trim() || undefined,
  };
}

function rowMatchesWorkbenchFilters(row: TaskPublicWorkbenchRow, filters: TaskPublicWorkbenchFilters): boolean {
  if (filters.statuses?.length && !filters.statuses.includes(row.status ?? "")) return false;
  if (filters.stateGroups?.length && !filters.stateGroups.includes(row.stateGroup)) return false;
  if (filters.labels?.length && !filters.labels.some((label) => row.labels.includes(label))) return false;
  if (filters.assigneeIds?.length && !filters.assigneeIds.includes(row.assigneeId ?? "")) return false;
  if (filters.cycleIds?.length && !filters.cycleIds.includes(row.cycleId ?? "")) return false;
  if (filters.moduleIds?.length && !filters.moduleIds.includes(row.moduleId ?? "")) return false;
  if (filters.taskTypes?.length && !filters.taskTypes.includes(row.taskType)) return false;
  if (filters.priorities?.length && !filters.priorities.includes(row.priority ?? Number.NaN)) return false;
  if (filters.search) {
    const haystack = [
      row.title,
      row.status,
      row.stateLabel,
      row.assigneeId,
      row.cycleId,
      row.moduleId,
      row.taskType,
      ...row.labels,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}

function buildWorkbenchColumns(rows: TaskPublicWorkbenchRow[]) {
  return TASK_STATE_GROUP_ORDER.map((group) => {
    const groupRows = rows.filter((row) => row.stateGroup === group);
    return {
      group,
      label: TASK_STATE_GROUPS[group].label,
      color: TASK_STATE_GROUPS[group].color,
      taskIds: groupRows.map((row) => row.id),
      count: groupRows.length,
    };
  });
}

function buildWorkbenchTableColumns(capabilities: TaskPublicWorkbenchInput["projectCapabilities"]) {
  const estimateEnabled = capabilities?.estimateEnabled ?? false;
  return [
    "title",
    "state",
    "priority",
    "assignee",
    "labels",
    "estimate",
    "cycle",
    "module",
    "updated",
  ]
    .filter((key) => shouldRenderTaskColumn(key, { estimateEnabled }))
    .map((key) => ({ key, label: workbenchTableLabel(key) }));
}

function workbenchTableRowFor(
  row: TaskPublicWorkbenchRow,
  visibleColumns: Array<{ key: string; label: string }>,
) {
  const cells: Record<string, string | number | null> = {
    title: row.title,
    state: row.stateLabel,
    priority: row.priority,
    assignee: row.assigneeId,
    labels: row.labels.join(", "),
    estimate: row.points,
    cycle: row.cycleId,
    module: row.moduleId,
    updated: row.updatedAt,
  };
  return {
    id: row.id,
    traceId: row.traceId,
    cells: Object.fromEntries(visibleColumns.map((column) => [column.key, cells[column.key] ?? null])),
  };
}

function workbenchLayoutFor(viewMode: TaskPublicWorkbenchViewMode): TaskPublicWorkbenchLayout {
  if (viewMode === "list") return "list";
  if (viewMode === "table") return "spreadsheet";
  return "kanban";
}

function workbenchTableLabel(key: string): string {
  switch (key) {
    case "title":
      return "Title";
    case "state":
      return "State";
    case "priority":
      return "Priority";
    case "assignee":
      return "Assignee";
    case "labels":
      return "Labels";
    case "estimate":
      return "Estimate";
    case "cycle":
      return "Cycle";
    case "module":
      return "Module";
    case "updated":
      return "Updated";
    default:
      return key;
  }
}

function mapTaskStatusToStateGroup(status: string | null | undefined): TaskStateGroup {
  const normalized = normalizedKey(status);
  if (normalized === "backlog") return "backlog";
  if (["in_progress", "running", "active", "started"].includes(normalized)) return "started";
  if (["done", "completed", "in_review", "review", "closed"].includes(normalized)) return "completed";
  if (["cancelled", "canceled", "archived"].includes(normalized)) return "cancelled";
  return "unstarted";
}

function normalizeTaskStateGroup(group: string | undefined): TaskStateGroup | null {
  return TASK_STATE_GROUP_ORDER.includes(group as TaskStateGroup) ? group as TaskStateGroup : null;
}

function normalizedKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function dependencyEdge(projectId: string, taskId: string, dependsOnTaskId: string): FulcrumTaskDependency {
  return {
    id: randomUUID(),
    projectId,
    taskId,
    dependsOnTaskId,
    dependencyKind: "task_dependency",
    traceId: `trace-dependency-${taskId}-${dependsOnTaskId}`,
  };
}

function assertNoDependencyCycle(edges: FulcrumTaskDependency[]): void {
  const blockedBy = new Map<string, string[]>();
  for (const edge of edges) {
    blockedBy.set(edge.taskId, [...(blockedBy.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) return false;
    if (visited.has(taskId)) return true;
    visiting.add(taskId);
    for (const dependencyId of blockedBy.get(taskId) ?? []) {
      if (!visit(dependencyId)) return false;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return true;
  };
  for (const taskId of blockedBy.keys()) {
    if (!visit(taskId)) throw new Error("Task dependency cycle rejected.");
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toPublicRow(task: FulcrumTask): TaskPublicRow {
  return {
    id: task.id,
    projectId: task.projectId,
    externalId: task.externalId,
    title: task.title,
    description: task.description,
    descriptionText: task.descriptionText,
    tiptapContent: task.tiptapContent,
    status: task.status,
    priority: task.priority,
    points: task.points,
    assigneeId: task.assigneeId,
    parentId: task.parentTaskId,
    successCriteria: task.successCriteria,
    traceId: task.traceId,
    deletedAt: task.deletedAt?.toISOString() ?? null,
    createdAt: task.createdAt?.toISOString() ?? null,
    updatedAt: task.updatedAt?.toISOString() ?? null,
  };
}

function toCsvTask(task: FulcrumTask): CsvTask {
  return {
    id: task.id,
    externalId: task.externalId ?? undefined,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt?.toISOString() ?? "",
  };
}

function normalizedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

function normalizedStringList(values: string[] | undefined): string[] | undefined {
  const normalized = values?.map((value) => value.trim()).filter(Boolean);
  return normalized && normalized.length > 0 ? normalized : undefined;
}
