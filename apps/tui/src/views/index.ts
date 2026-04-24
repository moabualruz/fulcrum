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

export function createAllTuiViews(): Record<TuiViewName, TuiViewModel> {
  return {
    dashboard: createTuiView("dashboard"),
    projects: createTuiView("projects"),
    tasks: createTuiView("tasks"),
    runs: createTuiView("runs"),
    worktrees: createTuiView("worktrees"),
    artifacts: createTuiView("artifacts"),
    "context-packs": createTuiView("context-packs"),
    "quality-gates": createTuiView("quality-gates"),
    doctor: createTuiView("doctor"),
    events: createTuiView("events")
  };
}
