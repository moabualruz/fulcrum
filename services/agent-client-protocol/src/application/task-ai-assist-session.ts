export type AiAssistRoute = "plan" | "build" | "review";

export interface TaskAiAssistSessionInput {
  task: {
    id: string;
    title: string;
    description?: string | null;
    project_id?: string | null;
    updated_at?: string | null;
  };
  agent?: string | null;
  route?: string | null;
  workspacePath?: string | null;
  docs?: readonly string[];
  memory?: readonly string[];
  repoState?: readonly string[];
}

export interface TaskAiAssistContextBundle {
  docs: readonly string[];
  memory: readonly string[];
  repoState: readonly string[];
  summary: string;
}

export interface TaskAiAssistSession {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  agent: string;
  route: AiAssistRoute;
  workspacePath: string;
  contextBundle: TaskAiAssistContextBundle;
}

const ROUTES = new Set<AiAssistRoute>(["plan", "build", "review"]);

export function assembleTaskAiAssistContext(input: TaskAiAssistSessionInput): TaskAiAssistContextBundle {
  const docs = input.docs?.length
    ? input.docs
    : [
      `Task brief: ${input.task.title}`,
      input.task.project_id ? `Project scope: ${input.task.project_id}` : "Project scope: active workspace",
    ];
  const memory = input.memory?.length
    ? input.memory
    : [
      "Memory snapshot: task history, prior decisions, and linked notes included when available.",
    ];
  const repoState = input.repoState?.length
    ? input.repoState
    : [
      `Workspace path: ${normalizeWorkspacePath(input.workspacePath)}`,
      input.task.updated_at ? `Task updated: ${input.task.updated_at}` : "Repo state: pending refresh",
    ];
  return {
    docs,
    memory,
    repoState,
    summary: `${docs.length} docs, ${memory.length} memory notes, ${repoState.length} repo signals`,
  };
}

export function startTaskAiAssistSession(input: TaskAiAssistSessionInput): TaskAiAssistSession {
  const route = normalizeRoute(input.route);
  const agent = input.agent?.trim() || "codex";
  const workspacePath = normalizeWorkspacePath(input.workspacePath);
  return {
    sessionId: `ai-${input.task.id}-${route}`,
    taskId: input.task.id,
    taskTitle: input.task.title,
    taskDescription: input.task.description ?? "",
    agent,
    route,
    workspacePath,
    contextBundle: assembleTaskAiAssistContext({ ...input, agent, route, workspacePath }),
  };
}

function normalizeRoute(value: string | null | undefined): AiAssistRoute {
  const candidate = value?.trim() as AiAssistRoute | undefined;
  return candidate && ROUTES.has(candidate) ? candidate : "plan";
}

function normalizeWorkspacePath(value: string | null | undefined): string {
  return value?.trim() || process.cwd();
}
