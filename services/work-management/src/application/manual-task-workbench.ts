import type { EntityManager } from "typeorm";

import {
  TASK_STATE_GROUP_ORDER,
  TASK_STATE_GROUPS,
  TASK_VIEW_ACCESS_SPECIFIERS,
  countTaskViewFilters,
  shouldRenderTaskColumn,
  type TaskStateGroup,
} from "@work-management/application/task-view-filtering.ts";
import { listTasks } from "@work-management/application/work-item-queries.ts";
import type { AppContext, TaskDto } from "@work-management/domain/work-item.ts";

export type ManualTaskWorkbenchViewMode = "board" | "list" | "table";
export type ManualTaskWorkbenchLayout = "kanban" | "list" | "spreadsheet";

export interface ManualTaskWorkbenchFilters {
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

export interface ManualTaskWorkbenchInput {
  projectId?: string | null;
  traceId?: string;
  viewMode?: ManualTaskWorkbenchViewMode;
  filters?: ManualTaskWorkbenchFilters;
  projectCapabilities?: {
    estimateEnabled?: boolean;
  };
}

export interface ManualTaskWorkbenchTaskRow {
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

export interface ManualTaskWorkbenchColumn {
  group: TaskStateGroup;
  label: string;
  color: string;
  taskIds: string[];
  count: number;
}

export interface ManualTaskWorkbenchTableColumn {
  key: string;
  label: string;
}

export interface ManualTaskWorkbenchTableRow {
  id: string;
  traceId?: string;
  cells: Record<string, string | number | null>;
}

export interface ManualTaskWorkbenchOutput {
  projectId: string | null;
  traceId?: string;
  viewMode: ManualTaskWorkbenchViewMode;
  layout: ManualTaskWorkbenchLayout;
  filtersApplied: number;
  accessSpecifiers: Array<{ key: "PUBLIC" | "PRIVATE"; i18nLabel: string }>;
  columns: ManualTaskWorkbenchColumn[];
  listRows: ManualTaskWorkbenchTaskRow[];
  table: {
    visibleColumns: ManualTaskWorkbenchTableColumn[];
    rows: ManualTaskWorkbenchTableRow[];
  };
  emptyState: {
    allTasksEmpty: boolean;
    visibleTasksEmpty: boolean;
    message: string;
  };
}

export async function buildManualTaskWorkbench(
  em: EntityManager,
  ctx: AppContext,
  input: ManualTaskWorkbenchInput = {},): Promise<ManualTaskWorkbenchOutput> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  const scopedCtx = {...ctx, projectId };
  const tasks = await listTasks(em, scopedCtx, {});
  const rows = tasks.map((task) => taskToWorkbenchRow(task, input.traceId));
  const filters = normalizeFilters(input.filters);
  const visibleRows = rows.filter((row) => matchesFilters(row, filters));
  const columns = buildColumns(visibleRows);
  const visibleColumns = buildTableColumns(input.projectCapabilities);

  return {
    projectId,
    traceId: input.traceId,
    viewMode: input.viewMode ?? "board",
    layout: workbenchLayoutFor(input.viewMode ?? "board"),
    filtersApplied: countTaskViewFilters({...filters }),
    accessSpecifiers: [...TASK_VIEW_ACCESS_SPECIFIERS],
    columns,
    listRows: visibleRows,
    table: {
      visibleColumns,
      rows: visibleRows.map((row) => tableRowFor(row, visibleColumns)),
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

export function mapFulcrumStatusToTaskStateGroup(status: string | null | undefined): TaskStateGroup {
  const normalized = (status ?? "").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "backlog") return "backlog";
  if (["in_progress", "running", "active", "started"].includes(normalized)) return "started";
  if (["done", "completed", "in_review", "review", "closed"].includes(normalized)) return "completed";
  if (["cancelled", "canceled", "archived"].includes(normalized)) return "cancelled";
  return "unstarted";
}

function taskToWorkbenchRow(task: TaskDto, traceId: string | undefined): ManualTaskWorkbenchTaskRow {
  const stateGroup = mapFulcrumStatusToTaskStateGroup(task.status);
  return {
    id: task.id,
    traceId,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    stateGroup,
    stateLabel: TASK_STATE_GROUPS[stateGroup].label,
    priority: task.priority,
    points: task.points,
    assigneeId: task.assigneeId,
    labels: task.labels,
    taskType: task.taskType,
    cycleId: task.cycleId,
    moduleId: task.moduleId,
    parentId: task.parentId,
    dependencyIds: task.dependencies.blocked_by,
    updatedAt: task.updatedAt.toISOString(),
  };
}

function normalizeFilters(filters: ManualTaskWorkbenchFilters | undefined): ManualTaskWorkbenchFilters {
  if (!filters) return {};
  return {
    statuses: nonEmptyStrings(filters.statuses),
    stateGroups: filters.stateGroups?.filter((group) => TASK_STATE_GROUP_ORDER.includes(group)),
    labels: nonEmptyStrings(filters.labels),
    assigneeIds: nonEmptyStrings(filters.assigneeIds),
    cycleIds: nonEmptyStrings(filters.cycleIds),
    moduleIds: nonEmptyStrings(filters.moduleIds),
    taskTypes: nonEmptyStrings(filters.taskTypes),
    priorities: filters.priorities?.filter((value) => Number.isInteger(value)),
    search: filters.search?.trim() || undefined,
  };
}

function matchesFilters(row: ManualTaskWorkbenchTaskRow, filters: ManualTaskWorkbenchFilters): boolean {
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
      row.taskType,...row.labels,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}

function buildColumns(rows: ManualTaskWorkbenchTaskRow[]): ManualTaskWorkbenchColumn[] {
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

function buildTableColumns(capabilities: ManualTaskWorkbenchInput["projectCapabilities"]): ManualTaskWorkbenchTableColumn[] {
  const estimateEnabled = capabilities?.estimateEnabled ?? false;
  const keys = [
    "title",
    "state",
    "priority",
    "assignee",
    "labels",
    "estimate",
    "cycle",
    "module",
    "updated",
  ].filter((key) => shouldRenderTaskColumn(key, { estimateEnabled }));
  return keys.map((key) => ({ key, label: tableLabel(key) }));
}

function tableRowFor(
  row: ManualTaskWorkbenchTaskRow,
  visibleColumns: ManualTaskWorkbenchTableColumn[],): ManualTaskWorkbenchTableRow {
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

function workbenchLayoutFor(viewMode: ManualTaskWorkbenchViewMode): ManualTaskWorkbenchLayout {
  if (viewMode === "list") return "list";
  if (viewMode === "table") return "spreadsheet";
  return "kanban";
}

function tableLabel(key: string): string {
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

function nonEmptyStrings(values: string[] | undefined): string[] | undefined {
  const normalized = values?.map((value) => value.trim()).filter(Boolean);
  return normalized?.length ? normalized : undefined;
}
