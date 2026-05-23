export type ResilienceSurface = "cli" | "tui";

export type ResilienceStateKind =
  | "missing-api"
  | "missing-feature-flag"
  | "empty-list"
  | "permission-denied"
  | "unavailable-sidecar"
  | "failed-subscription"
  | "partial-data";

export interface ResilienceStateCase {
  id: string;
  commandFamily: string;
  surface: ResilienceSurface;
  state: ResilienceStateKind;
  trigger: string;
  expected: {
    stdout: "json-only" | "empty" | "screen";
    stderr: "empty" | "actionable-error";
    exitCode: 0 | 1 | 2;
    recovery: string;
  };
}

export const REQUIRED_RESILIENCE_STATES = [
  {
    id: "cli:missing-api",
    commandFamily: "projects/tasks/docs/repos/artifacts",
    surface: "cli",
    state: "missing-api",
    trigger: "FULCRUM_SERVER_URL unset and no injected caller",
    expected: {
      stdout: "empty",
      stderr: "actionable-error",
      exitCode: 1,
      recovery: "Configure FULCRUM_SERVER_URL or run product init before retry.",
    },
  },
  {
    id: "cli:permission-denied",
    commandFamily: "runs/review/settings",
    surface: "cli",
    state: "permission-denied",
    trigger: "API returns forbidden application error",
    expected: {
      stdout: "empty",
      stderr: "actionable-error",
      exitCode: 1,
      recovery: "Show FORBIDDEN code on stderr and keep JSON stdout clean.",
    },
  },
  {
    id: "cli:missing-feature-flag",
    commandFamily: "public-api/inference/external-provider",
    surface: "cli",
    state: "missing-feature-flag",
    trigger: "API returns FUL_MISSING_FEATURE_FLAG",
    expected: {
      stdout: "empty",
      stderr: "actionable-error",
      exitCode: 1,
      recovery: "Name the required feature flag and retry command.",
    },
  },
  {
    id: "cli:empty-list",
    commandFamily: "docs/memory/routing/import",
    surface: "cli",
    state: "empty-list",
    trigger: "Caller returns an empty collection",
    expected: {
      stdout: "json-only",
      stderr: "empty",
      exitCode: 0,
      recovery: "Emit [] for --json or a plain empty-state sentence.",
    },
  },
  {
    id: "tui:empty-list",
    commandFamily: "projects/tasks/docs/repos/search/settings",
    surface: "tui",
    state: "empty-list",
    trigger: "Screen caller returns an empty collection",
    expected: {
      stdout: "screen",
      stderr: "empty",
      exitCode: 0,
      recovery: "Render an empty-state line and keep Esc navigation available.",
    },
  },
  {
    id: "tui:unavailable-sidecar",
    commandFamily: "inference/runs/repos",
    surface: "tui",
    state: "unavailable-sidecar",
    trigger: "Caller throws while loading a domain screen",
    expected: {
      stdout: "screen",
      stderr: "empty",
      exitCode: 0,
      recovery: "Render error copy with a concrete fix and keep global navigation active.",
    },
  },
  {
    id: "tui:failed-subscription",
    commandFamily: "runs/tasks/watch",
    surface: "tui",
    state: "failed-subscription",
    trigger: "Run or task subscription closes after screen load",
    expected: {
      stdout: "screen",
      stderr: "empty",
      exitCode: 0,
      recovery: "Unsubscribe on screen close/stop so stale updates cannot mutate status.",
    },
  },
  {
    id: "tui:partial-data",
    commandFamily: "runs/artifacts/notifications",
    surface: "tui",
    state: "partial-data",
    trigger: "Caller returns rows missing optional labels, project names, or observability groups",
    expected: {
      stdout: "screen",
      stderr: "empty",
      exitCode: 0,
      recovery: "Render fallbacks such as no project, no title, and empty observability groups.",
    },
  },
] as const satisfies readonly ResilienceStateCase[];

export function listResilienceStates(surface?: ResilienceSurface): readonly ResilienceStateCase[] {
  return surface ? REQUIRED_RESILIENCE_STATES.filter((state) => state.surface === surface) : REQUIRED_RESILIENCE_STATES;
}

export function findResilienceState(id: string): ResilienceStateCase | undefined {
  return REQUIRED_RESILIENCE_STATES.find((state) => state.id === id);
}
