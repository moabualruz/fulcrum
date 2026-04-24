export interface TuiRecord {
  id: string;
  label: string;
  status?: string;
  detail?: string;
}

export interface TuiViewModel {
  title: string;
  records: TuiRecord[];
  health?: string;
  updatedAt?: string;
}

export type TuiViewName =
  | "dashboard"
  | "projects"
  | "tasks"
  | "runs"
  | "worktrees"
  | "artifacts"
  | "context-packs"
  | "quality-gates"
  | "doctor"
  | "events";

export interface TuiWorkState {
  projects?: Array<{ projectId: string; name: string; healthState: string }>;
  tasks?: Array<{ taskId: string; title: string; status: string; projectId: string }>;
  runs?: Array<{ runId: string; status: string; taskId: string }>;
  worktrees?: Array<{ worktreeId: string; status: string; path: string }>;
  contextPacks?: Array<{ contextPackId: string; status: string; taskId: string }>;
  qualityGateDefinitions?: Array<{ gateId: string; name: string; required: boolean }>;
  runEvents?: Array<{ eventId: string; type: string; severity: string }>;
}

const titles: Record<TuiViewName, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  tasks: "Tasks",
  runs: "Runs",
  worktrees: "Worktrees",
  artifacts: "Artifacts",
  "context-packs": "Context Packs",
  "quality-gates": "Quality Gates",
  doctor: "Doctor",
  events: "Event Stream"
};

export function createTuiView(name: TuiViewName, records: TuiRecord[] = []): TuiViewModel {
  return {
    title: titles[name],
    records,
    health: records.some((record) => record.status === "degraded") ? "degraded" : "managed",
    updatedAt: new Date(0).toISOString()
  };
}

export function renderTuiView(model: TuiViewModel): string {
  const rows = model.records.length
    ? model.records.map((record) =>
        [record.id, record.label, record.status, record.detail].filter(Boolean).join(" | ")
      )
    : ["empty"];
  return [`${model.title} [${model.health ?? "unknown"}]`, ...rows].join("\n");
}

export function createAllTuiViews(state: TuiWorkState = {}): Record<TuiViewName, TuiViewModel> {
  const projects = state.projects ?? [];
  const tasks = state.tasks ?? [];
  const runs = state.runs ?? [];
  const worktrees = state.worktrees ?? [];
  const contextPacks = state.contextPacks ?? [];
  const gates = state.qualityGateDefinitions ?? [];
  const events = state.runEvents ?? [];
  return {
    dashboard: createTuiView("dashboard", [
      { id: "projects", label: `${projects.length} projects`, status: "managed" },
      { id: "tasks", label: `${tasks.length} tasks`, status: "managed" },
      { id: "runs", label: `${runs.length} runs`, status: "managed" }
    ]),
    projects: createTuiView(
      "projects",
      projects.map((project) => ({
        id: project.projectId,
        label: project.name,
        status: project.healthState
      }))
    ),
    tasks: createTuiView(
      "tasks",
      tasks.map((task) => ({
        id: task.taskId,
        label: task.title,
        status: task.status,
        detail: task.projectId
      }))
    ),
    runs: createTuiView(
      "runs",
      runs.map((run) => ({
        id: run.runId,
        label: run.taskId,
        status: run.status
      }))
    ),
    worktrees: createTuiView(
      "worktrees",
      worktrees.map((worktree) => ({
        id: worktree.worktreeId,
        label: worktree.path,
        status: worktree.status
      }))
    ),
    artifacts: createTuiView("artifacts"),
    "context-packs": createTuiView(
      "context-packs",
      contextPacks.map((pack) => ({
        id: pack.contextPackId,
        label: pack.taskId,
        status: pack.status
      }))
    ),
    "quality-gates": createTuiView(
      "quality-gates",
      gates.map((gate) => ({
        id: gate.gateId,
        label: gate.name,
        status: gate.required ? "required" : "optional"
      }))
    ),
    doctor: createTuiView("doctor"),
    events: createTuiView(
      "events",
      events.map((event) => ({
        id: event.eventId,
        label: event.type,
        status: event.severity
      }))
    )
  };
}
