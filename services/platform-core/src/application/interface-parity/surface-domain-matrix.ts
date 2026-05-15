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
  | "skills"
  | "routing"
  | "inference"
  | "components"
  | "doctor"
  | "auth";

export interface SurfaceDomain {
  name: SurfaceDomainName;
  surfaces: Readonly<Record<SurfaceName, boolean>>;
  routerKeys: readonly string[];
  cliCommands: readonly string[];
  tuiLabels: readonly string[];
  webRoutes: readonly string[];
  apiRoutes: readonly string[];
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
  },
): SurfaceDomain {
  return {
    name,
    surfaces: {
      web: true,
      cli: true,
      tui: true,
      api: config.api ?? false,
    },
    routerKeys: config.routerKeys ?? [name],
    cliCommands: config.cliCommands ?? [name],
    tuiLabels: config.tuiLabels ?? [name],
    webRoutes: config.webRoutes ?? [name],
    apiRoutes: config.apiRoutes ?? [name],
  };
}

export const REQUIRED_SURFACE_DOMAINS = [
  domain("projects", {
    tuiLabels: ["projects"],
    webRoutes: ["projects/+page.svelte"],
  }),
  domain("tasks", {
    tuiLabels: ["tasks"],
    webRoutes: ["projects/[id]/board/+page.svelte", "tasks/[id]/+page.svelte"],
    api: true,
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
  }),
  domain("repos", {
    routerKeys: ["repos", "repo_branches", "repo_commits"],
    tuiLabels: ["repos", "repositories"],
    webRoutes: ["repos/+page.svelte", "projects/[id]/repos/+page.svelte"],
    api: true,
  }),
  domain("artifacts", {
    tuiLabels: ["artifacts"],
    webRoutes: ["artifacts/+page.svelte", "projects/[id]/artifacts/+page.svelte"],
    api: true,
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
  domain("auth", {
    tuiLabels: ["auth"],
    webRoutes: ["auth/login/+page.svelte"],
  }),
] as const satisfies readonly SurfaceDomain[];

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
