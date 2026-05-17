export interface CommandPaletteEntityScope {
  orgId?: string | null;
  userId?: string | null;
  projectId?: string | null;
}

export interface TaskResult {
  id: string;
  title: string;
  identifier?: string;
  projectId: string;
}

export interface ProjectResult {
  id: string;
  name: string;
}

export interface SprintResult {
  id: string;
  name: string;
  projectId: string;
}

export interface CommandPaletteEntities {
  tasks: TaskResult[];
  projects: ProjectResult[];
  sprints: SprintResult[];
}

export async function fetchCommandPaletteEntities(
  fetchFn: typeof fetch,
  scope: CommandPaletteEntityScope,
): Promise<CommandPaletteEntities> {
  const orgId = scope.orgId?.trim();
  const userId = scope.userId?.trim();
  if (!orgId || !userId) return { tasks: [], projects: [], sprints: [] };

  const [tasksResult, projectsResult] = await Promise.allSettled([
    requestRows(fetchFn, "/api/v1/tasks", {
      orgId,
      userId,
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
    }).then((rows) => rows.map(toTaskResult).filter(isDefined)),
    requestRows(fetchFn, "/api/v1/projects", { orgId })
      .then((rows) => rows.map(toProjectResult).filter(isDefined)),
  ]);

  const tasks = settledValue(tasksResult, []);
  const projects = settledValue(projectsResult, []);
  const sprintProjectIds = scope.projectId ? [scope.projectId] : projects.map((project) => project.id);
  const sprintResults = await Promise.allSettled(
    sprintProjectIds.map((projectId) =>
      requestRows(fetchFn, "/api/v1/sprints", { orgId, projectId })
        .then((rows) => rows.map(toSprintResult).filter(isDefined)),
    ),
  );

  return {
    tasks,
    projects,
    sprints: sprintResults.flatMap((result) => settledValue(result, [])),
  };
}

async function requestRows(
  fetchFn: typeof fetch,
  path: string,
  query: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const response = await fetchFn(publicApiPath(path, query), {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null);
  const rows = Array.isArray((body as { data?: unknown })?.data)
    ? (body as { data: unknown[] }).data
    : Array.isArray(body)
    ? body
    : [];
  return rows.filter(isRecord);
}

function publicApiPath(path: string, query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  return `${path}?${params.toString()}`;
}

function toTaskResult(row: Record<string, unknown>): TaskResult | null {
  const id = stringValue(row["id"]);
  const title = stringValue(row["title"]);
  const projectId = stringValue(row["projectId"] ?? row["project_id"]);
  if (!id || !title || !projectId) return null;
  const identifier = stringValue(row["identifier"] ?? row["externalId"] ?? row["external_id"]);
  return { id, title, projectId, ...(identifier ? { identifier } : {}) };
}

function toProjectResult(row: Record<string, unknown>): ProjectResult | null {
  const id = stringValue(row["id"]);
  const name = stringValue(row["name"]);
  return id && name ? { id, name } : null;
}

function toSprintResult(row: Record<string, unknown>): SprintResult | null {
  const id = stringValue(row["id"]);
  const name = stringValue(row["name"]);
  const projectId = stringValue(row["projectId"] ?? row["project_id"]);
  return id && name && projectId ? { id, name, projectId } : null;
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
