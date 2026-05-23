export type SurfaceName = "web" | "cli" | "tui" | "api";

export type SurfaceDomainName =
  | "projects"
  | "tasks"
  | "sprints"
  | "docs"
  | "memory"
  | "runs"
  | "repos"
  | "artifacts"
  | "search"
  | "notifications"
  | "reports"
  | "planning"
  | "review"
  | "skills"
  | "routing"
  | "inference"
  | "components"
  | "doctor"
  | "settings"
  | "auth";

export type SurfaceParityState = "interactive" | "display-only" | "gap";

export interface SurfaceParityWorkflow {
  name: string;
  cli: readonly string[];
  tui: readonly string[];
  api: readonly string[];
  stateShape: readonly string[];
  manualScript: readonly string[];
}

export interface SurfaceParityGap {
  id: string;
  surface: SurfaceName;
  reason: string;
  expected: string;
}

export interface SurfaceDomain {
  name: SurfaceDomainName;
  surfaces: Readonly<Record<SurfaceName, boolean>>;
  state: Readonly<Record<SurfaceName, SurfaceParityState>>;
  routerKeys: readonly string[];
  cliCommands: readonly string[];
  tuiLabels: readonly string[];
  webRoutes: readonly string[];
  apiRoutes: readonly string[];
  workflows: readonly SurfaceParityWorkflow[];
  gaps: readonly SurfaceParityGap[];
}

export type InterfaceActionKind = "create" | "read" | "update" | "delete" | "workflow";

export interface InterfaceParityAction {
  domain: SurfaceDomainName;
  name: string;
  kind: InterfaceActionKind;
  webRoute: string;
  cliCommand: string;
  tuiAction: string;
  apiRoute: string;
  stateShape: readonly string[];
  manualScript: readonly string[];
}

function domain(
  name: SurfaceDomainName,
  config: {
    routerKeys?: readonly string[];
    cliCommands?: readonly string[];
    tuiLabels?: readonly string[];
    webRoutes?: readonly string[];
    apiRoutes?: readonly string[];
    api?: boolean;
    state?: Partial<Record<SurfaceName, SurfaceParityState>>;
    workflows?: readonly SurfaceParityWorkflow[];
    gaps?: readonly SurfaceParityGap[];
  },
): SurfaceDomain {
  const apiState: SurfaceParityState = config.api ? "interactive" : "gap";
  return {
    name,
    surfaces: {
      web: true,
      cli: true,
      tui: true,
      api: config.api ?? false,
    },
    state: {
      web: config.state?.web ?? "interactive",
      cli: config.state?.cli ?? "interactive",
      tui: config.state?.tui ?? "interactive",
      api: config.state?.api ?? apiState,
    },
    routerKeys: config.routerKeys ?? [name],
    cliCommands: config.cliCommands ?? [name],
    tuiLabels: config.tuiLabels ?? [name],
    webRoutes: config.webRoutes ?? [name],
    apiRoutes: config.apiRoutes ?? [name],
    workflows: config.workflows ?? [],
    gaps: config.gaps ?? [],
  };
}

function action(config: InterfaceParityAction): InterfaceParityAction {
  return config;
}

export const REQUIRED_SURFACE_DOMAINS = [
  domain("projects", {
    tuiLabels: ["projects"],
    webRoutes: ["projects/+page.svelte"],
    apiRoutes: ["projects"],
    api: true,
    workflows: [{
      name: "project inventory",
      cli: ["fulcrum projects list --json", "fulcrum projects stats --json"],
      tui: ["Projects screen", "launcher Projects entry"],
      api: ["appRouter.projects", "GET /api/v1/projects"],
      stateShape: ["id", "name", "slug", "openTaskCount"],
      manualScript: [
        "Create or seed a project",
        "Run `fulcrum projects list --json`",
        "Open TUI Projects",
        "Compare project id/name and trace output",
      ],
    }],
  }),
  domain("tasks", {
    tuiLabels: ["tasks"],
    webRoutes: ["projects/[id]/board/+page.svelte", "tasks/[id]/+page.svelte"],
    api: true,
    workflows: [{
      name: "task command/control",
      cli: ["fulcrum tasks list --json", "fulcrum tasks create --title <title> --json", "fulcrum tasks update <id> --status <status> --json"],
      tui: ["Tasks screen", "TaskListScreen bulk/status actions", "dependency run preview/dispatch"],
      api: ["appRouter.tasks", "TaskPublicApiModule"],
      stateShape: ["id", "title", "status", "assigneeId", "labels"],
      manualScript: [
        "Create task through CLI",
        "Open TUI Tasks",
        "Move task status in TUI",
        "Re-run CLI get/list and compare id/status/trace",
      ],
    }],
  }),
  domain("sprints", {
    tuiLabels: ["sprints"],
    webRoutes: ["projects/[id]/sprints/+page.svelte"],
    api: true,
  }),
  domain("docs", {
    tuiLabels: ["docs", "documents"],
    webRoutes: ["docs/+page.svelte"],
    api: true,
    state: { tui: "display-only" },
    workflows: [{
      name: "document inventory and template access",
      cli: ["fulcrum docs list --json", "fulcrum docs template list --json"],
      tui: ["Docs screen", "New doc screen"],
      api: ["appRouter.docs", "DocumentPublicApiModule"],
      stateShape: ["id", "title", "docType", "traceId"],
      manualScript: [
        "Create or seed a document",
        "Run CLI docs list/template list",
        "Open TUI Docs/New Doc",
        "Record missing edit/comment equivalents",
      ],
    }],
    gaps: [{
      id: "docs:tui-display-only-list",
      surface: "tui",
      reason: "TUI root currently exposes Docs navigation but does not call docs.list for rows.",
      expected: "Docs screen lists documents and dispatches create/update/delete/comment actions through caller.docs.",
    }],
  }),
  domain("memory", {
    routerKeys: ["memories", "context"],
    cliCommands: ["memory", "memories", "context"],
    tuiLabels: ["memory"],
    webRoutes: ["memory/+page.svelte", "context/preview/+page.svelte"],
    apiRoutes: ["memory"],
    api: true,
  }),
  domain("runs", {
    routerKeys: ["agent_runs", "orchestration"],
    cliCommands: ["runs", "agent_runs", "symphony"],
    tuiLabels: ["runs", "agent runs", "orchestration"],
    webRoutes: ["runs/+page.svelte", "orchestration/+page.svelte"],
    apiRoutes: ["runs"],
    api: true,
    workflows: [{
      name: "run dispatch and monitor",
      cli: ["fulcrum runs dispatch --json", "fulcrum runs feed --watch --json", "fulcrum runs cancel <id> --json"],
      tui: ["Runs screen", "Run detail transcript/log pane", "runs.onRunUpdate subscription"],
      api: ["appRouter.agent_runs", "runs public API"],
      stateShape: ["id", "agent", "status", "taskTitle", "logLines"],
      manualScript: [
        "Dispatch run through CLI",
        "Open TUI Runs",
        "Verify transcript/log update and same run id",
        "Cancel from one surface and compare terminal state",
      ],
    }],
  }),
  domain("repos", {
    routerKeys: ["repos", "repo_branches", "repo_commits"],
    tuiLabels: ["repos", "repositories"],
    webRoutes: ["repos/+page.svelte", "projects/[id]/repos/+page.svelte"],
    api: true,
    workflows: [{
      name: "repository inventory and sync",
      cli: ["fulcrum repos list --json", "fulcrum repos sync <id> --json"],
      tui: ["Repos screen"],
      api: ["appRouter.repos", "RepositoryPublicApiModule"],
      stateShape: ["id", "slug", "branch", "dirty", "openTaskCount"],
      manualScript: [
        "Register or seed repo",
        "Run CLI repos list/sync",
        "Open TUI Repos",
        "Compare repo id/branch/dirty state",
      ],
    }],
  }),
  domain("artifacts", {
    tuiLabels: ["artifacts"],
    webRoutes: ["artifacts/+page.svelte", "projects/[id]/artifacts/+page.svelte"],
    api: true,
    workflows: [{
      name: "artifact provenance and retention",
      cli: ["fulcrum artifacts list --json", "fulcrum artifacts download <id> --json", "fulcrum artifacts archive <id> --json"],
      tui: ["Artifacts screen", "artifact preview"],
      api: ["appRouter.artifacts", "Artifact public API"],
      stateShape: ["id", "filename", "previewKind", "retentionStatus", "provenance"],
      manualScript: [
        "Upload or seed artifact",
        "List artifact through CLI",
        "Open TUI Artifacts preview",
        "Compare id/provenance/retention fields",
      ],
    }],
  }),
  domain("search", {
    tuiLabels: ["search"],
    webRoutes: ["search/+page.svelte"],
    api: true,
  }),
  domain("notifications", {
    routerKeys: ["notify"],
    cliCommands: ["notify", "notifications"],
    tuiLabels: ["notifications", "inbox", "notification rules"],
    webRoutes: ["inbox/+page.svelte", "settings/notifications/+page.svelte"],
    apiRoutes: ["notifications", "notify"],
    api: true,
    workflows: [{
      name: "notification bell and rules",
      cli: ["fulcrum notify list --unread --json", "fulcrum notify watch --json"],
      tui: ["Notifications screen", "Notification Rules screen", "status bar bell count"],
      api: ["appRouter.notify", "NotificationPublicApiController"],
      stateShape: ["id", "title", "read", "sourceKind", "sourceId"],
      manualScript: [
        "Seed unread notification",
        "Run CLI notify list --unread",
        "Open TUI Notifications and status footer",
        "Mark read/mute and compare unread count",
      ],
    }],
  }),
  domain("reports", {
    routerKeys: ["reports"],
    cliCommands: ["product", "reports"],
    tuiLabels: ["planning"],
    webRoutes: ["projects/[id]/updates/+page.svelte", "reports/+page.svelte"],
    apiRoutes: ["reports"],
    api: true,
    state: { tui: "gap" },
    workflows: [{
      name: "quality and handoff reports",
      cli: ["fulcrum product reports final-qa --project <id> --trace <id> --json", "fulcrum product reports uat-handoff --project <id> --json"],
      tui: ["Planning screen report actions"],
      api: ["appRouter.reports"],
      stateShape: ["traceId", "projectId", "status", "artifacts"],
      manualScript: [
        "Generate report through CLI",
        "Open TUI Planning",
        "Record whether equivalent report action exists",
        "Compare traceId/artifact ids when available",
      ],
    }],
    gaps: [{
      id: "reports:tui-command-gap",
      surface: "tui",
      reason: "Planning TUI owns review flow but does not expose every product reports verb.",
      expected: "TUI Planning exposes final-qa, uat-handoff, decision, and e2e-run actions.",
    }],
  }),
  domain("planning", {
    routerKeys: ["planning"],
    cliCommands: ["product", "planning"],
    tuiLabels: ["planning"],
    webRoutes: ["projects/[id]/planning/materialize/+page.svelte"],
    apiRoutes: ["planning"],
    api: true,
    workflows: [{
      name: "approved plan preview/materialize",
      cli: ["fulcrum product planning preview --plan <id> --file <path> --json", "fulcrum product planning materialize --plan <id> --file <path> --json"],
      tui: ["Planning screen", "approved-plan preview/materialize actions"],
      api: ["appRouter.planning"],
      stateShape: ["planId", "traceId", "tasks", "documents", "dependencies"],
      manualScript: [
        "Preview approved plan through CLI",
        "Open TUI Planning with same plan id",
        "Materialize through both surfaces in isolated fixtures",
        "Compare task/doc/dependency counts and trace id",
      ],
    }],
  }),
  domain("review", {
    routerKeys: ["review"],
    cliCommands: ["product", "reports"],
    tuiLabels: ["planning"],
    webRoutes: ["projects/[id]/review/+page.svelte", "projects/[id]/updates/+page.svelte"],
    apiRoutes: ["review"],
    api: true,
    state: { cli: "interactive", tui: "display-only" },
    workflows: [{
      name: "review acceptance loop",
      cli: ["fulcrum product reports decision --project <id> --trace <id> --json"],
      tui: ["Planning screen workflow-cycle controls"],
      api: ["appRouter.review"],
      stateShape: ["traceId", "reviewSessions", "decision", "status"],
      manualScript: [
        "Start review cycle through CLI report/review verb",
        "Open TUI Planning review area",
        "Record manual review status",
        "Compare trace and review session ids",
      ],
    }],
    gaps: [{
      id: "review:tui-display-gap",
      surface: "tui",
      reason: "TUI Planning renders workflow review state but does not expose every review decision verb.",
      expected: "TUI exposes start-code-review, approve, changes-requested, and block actions matching CLI/API.",
    }],
  }),
  domain("skills", {
    routerKeys: ["fulcrum_skills", "routing"],
    cliCommands: ["fulcrum_skills", "skills"],
    tuiLabels: ["skills"],
    webRoutes: ["settings/skills/+page.svelte"],
  }),
  domain("routing", {
    tuiLabels: ["routing", "routing rules"],
    webRoutes: ["settings/routing/+page.svelte", "projects/[id]/routing/+page.svelte"],
  }),
  domain("inference", {
    tuiLabels: ["inference"],
    webRoutes: ["settings/inference/+page.svelte", "inference/+page.svelte"],
  }),
  domain("components", {
    routerKeys: ["doctor"],
    cliCommands: ["components", "component", "install", "uninstall"],
    tuiLabels: ["components"],
    webRoutes: ["doctor/+page.svelte"],
  }),
  domain("doctor", {
    tuiLabels: ["doctor"],
    webRoutes: ["doctor/+page.svelte"],
  }),
  domain("settings", {
    routerKeys: ["settings", "flags", "theme"],
    cliCommands: ["settings", "flags", "theme", "i18n"],
    tuiLabels: ["doctor", "feature flags", "auth"],
    webRoutes: ["settings/+page.svelte", "settings/notifications/+page.svelte", "settings/inference/+page.svelte"],
    apiRoutes: ["settings", "flags", "theme"],
    api: true,
    workflows: [{
      name: "operator settings",
      cli: ["fulcrum settings list --json", "fulcrum flags list --json", "fulcrum theme list --json"],
      tui: ["Doctor/Settings screen", "Feature Flags screen", "Auth screen"],
      api: ["appRouter.settings", "SettingsPublicApiModule"],
      stateShape: ["key", "value", "enabled", "source"],
      manualScript: [
        "Set a flag or setting through CLI",
        "Open TUI Feature Flags/Doctor",
        "Toggle or inspect same setting",
        "Compare key/value/source and trace output",
      ],
    }],
  }),
  domain("auth", {
    tuiLabels: ["auth"],
    webRoutes: ["auth/login/+page.svelte"],
  }),
] as const satisfies readonly SurfaceDomain[];

export const REQUIRED_INTERFACE_ACTIONS = [
  action({
    domain: "projects",
    name: "create project",
    kind: "create",
    webRoute: "projects/new/+page.svelte",
    cliCommand: "fulcrum projects create --name <name> --json",
    tuiAction: "Projects screen create-project action",
    apiRoute: "appRouter.projects.create",
    stateShape: ["id", "name", "slug", "traceId"],
    manualScript: [
      "Create project in Web",
      "Create project through CLI with same name in isolated fixture",
      "Open TUI Projects and run create-project",
      "Compare project id/slug/trace fields through API list",
    ],
  }),
  action({
    domain: "tasks",
    name: "create task",
    kind: "create",
    webRoute: "projects/[id]/board/+page.svelte",
    cliCommand: "fulcrum tasks create --title <title> --json",
    tuiAction: "Tasks screen create-task action",
    apiRoute: "appRouter.tasks.create",
    stateShape: ["id", "title", "status", "assigneeId", "traceId"],
    manualScript: [
      "Create task in Web board",
      "Create task through CLI",
      "Create task through TUI Tasks",
      "Compare task id/title/status through API list",
    ],
  }),
  action({
    domain: "tasks",
    name: "update task status",
    kind: "update",
    webRoute: "projects/[id]/board/+page.svelte",
    cliCommand: "fulcrum tasks update <id> --status <status> --json",
    tuiAction: "TaskListScreen status action",
    apiRoute: "appRouter.tasks.update",
    stateShape: ["id", "status", "updatedAt", "traceId"],
    manualScript: [
      "Move task status in Web board",
      "Move same task through CLI",
      "Move same task through TUI",
      "Compare status and trace output through API get/list",
    ],
  }),
  action({
    domain: "docs",
    name: "create document",
    kind: "create",
    webRoute: "docs/new/+page.svelte",
    cliCommand: "fulcrum docs create --title <title> --json",
    tuiAction: "New doc screen create-document action",
    apiRoute: "appRouter.docs.create",
    stateShape: ["id", "title", "docType", "traceId"],
    manualScript: [
      "Create document in Web",
      "Create document through CLI",
      "Create document through TUI New Doc",
      "Compare document id/title through API list",
    ],
  }),
  action({
    domain: "runs",
    name: "dispatch run",
    kind: "workflow",
    webRoute: "runs/+page.svelte",
    cliCommand: "fulcrum runs dispatch --json",
    tuiAction: "Runs screen dispatch-run action",
    apiRoute: "appRouter.agent_runs.dispatch",
    stateShape: ["id", "agent", "status", "traceId"],
    manualScript: [
      "Dispatch run from Web",
      "Dispatch run through CLI",
      "Dispatch run through TUI Runs",
      "Compare run id/status/log stream through API feed",
    ],
  }),
  action({
    domain: "runs",
    name: "cancel run",
    kind: "workflow",
    webRoute: "runs/[id]/+page.svelte",
    cliCommand: "fulcrum runs cancel <id> --json",
    tuiAction: "Run detail cancel action",
    apiRoute: "appRouter.agent_runs.cancel",
    stateShape: ["id", "status", "cancelledAt", "traceId"],
    manualScript: [
      "Cancel run from Web detail",
      "Cancel run through CLI",
      "Cancel run through TUI detail",
      "Compare terminal status through API get/feed",
    ],
  }),
  action({
    domain: "artifacts",
    name: "archive artifact",
    kind: "update",
    webRoute: "artifacts/[id]/+page.svelte",
    cliCommand: "fulcrum artifacts archive <id> --json",
    tuiAction: "Artifacts screen archive action",
    apiRoute: "appRouter.artifacts.archive",
    stateShape: ["id", "retentionStatus", "archivedAt", "traceId"],
    manualScript: [
      "Archive artifact from Web",
      "Archive artifact through CLI",
      "Archive artifact through TUI Artifacts",
      "Compare retention state through API list",
    ],
  }),
  action({
    domain: "search",
    name: "query workspace",
    kind: "read",
    webRoute: "search/+page.svelte",
    cliCommand: "fulcrum search query <query> --json",
    tuiAction: "Search screen query action",
    apiRoute: "appRouter.search.query",
    stateShape: ["query", "results", "entityId", "traceId"],
    manualScript: [
      "Search for known task/doc in Web",
      "Search same phrase through CLI",
      "Search same phrase through TUI",
      "Compare result ids and entity types through API query",
    ],
  }),
  action({
    domain: "notifications",
    name: "mark notification read",
    kind: "update",
    webRoute: "inbox/+page.svelte",
    cliCommand: "fulcrum notify mark-read <id> --json",
    tuiAction: "Notifications screen mark-read action",
    apiRoute: "appRouter.notify.markRead",
    stateShape: ["id", "read", "sourceKind", "traceId"],
    manualScript: [
      "Mark notification read in Web inbox",
      "Mark notification read through CLI",
      "Mark notification read through TUI Notifications",
      "Compare unread count through API list",
    ],
  }),
  action({
    domain: "settings",
    name: "update feature flag",
    kind: "update",
    webRoute: "settings/flags/+page.svelte",
    cliCommand: "fulcrum flags set <key> <value> --json",
    tuiAction: "Feature Flags screen toggle action",
    apiRoute: "appRouter.flags.set",
    stateShape: ["key", "value", "enabled", "source", "traceId"],
    manualScript: [
      "Toggle flag in Web settings",
      "Toggle same flag through CLI",
      "Toggle same flag through TUI Feature Flags",
      "Compare key/value/source through API list",
    ],
  }),
] as const satisfies readonly InterfaceParityAction[];

function normalized(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function listMissingDomains(
  surface: SurfaceName,
  values: readonly string[],
  aliasesFor: (domain: SurfaceDomain) => readonly string[],
): SurfaceDomainName[] {
  const available = normalized(values);
  return REQUIRED_SURFACE_DOMAINS
    .filter((domain) => domain.surfaces[surface])
    .filter((domain) => !aliasesFor(domain).some((alias) => available.has(alias.toLowerCase())))
    .map((domain) => domain.name);
}

export function listMissingCliDomains(commands: readonly string[]): SurfaceDomainName[] {
  return listMissingDomains("cli", commands, (domain) => domain.cliCommands);
}

export function listMissingTuiDomains(labels: readonly string[]): SurfaceDomainName[] {
  return listMissingDomains("tui", labels, (domain) => domain.tuiLabels);
}

export function listMissingApiDomains(routes: readonly string[]): SurfaceDomainName[] {
  return listMissingDomains("api", routes, (domain) => domain.apiRoutes);
}

export function listMissingWebRoutes(routes: readonly string[]): SurfaceDomainName[] {
  return listMissingDomains("web", routes, (domain) => domain.webRoutes);
}

export function listInterfaceActionParityGaps(actions: readonly InterfaceParityAction[] = REQUIRED_INTERFACE_ACTIONS): string[] {
  return actions.flatMap((candidate) => {
    const gaps: string[] = [];
    if (!candidate.webRoute) gaps.push(`${candidate.domain}:${candidate.name}:web`);
    if (!candidate.cliCommand.startsWith("fulcrum ")) gaps.push(`${candidate.domain}:${candidate.name}:cli`);
    if (!candidate.tuiAction) gaps.push(`${candidate.domain}:${candidate.name}:tui`);
    if (!candidate.apiRoute) gaps.push(`${candidate.domain}:${candidate.name}:api`);
    if (candidate.stateShape.length === 0) gaps.push(`${candidate.domain}:${candidate.name}:state`);
    if (candidate.manualScript.length < 4) gaps.push(`${candidate.domain}:${candidate.name}:manual`);
    return gaps;
  });
}
