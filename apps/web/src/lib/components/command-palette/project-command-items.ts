import type { CommandItem } from "./command-palette-filter.ts";

export type ProjectCommandScopeMode = "current" | "all" | "system";

export interface ProjectCommandItem extends CommandItem {
  scope: {
    projectId: string | null;
    mode: ProjectCommandScopeMode;
  };
  traceTarget: {
    kind: "project" | "workspace" | "system";
    id: string;
  };
  mutation: boolean;
}

export interface BuildProjectCommandItemsInput {
  activeProjectId: string | null;
}

const SYSTEM_SCOPE = {
  projectId: null,
  mode: "system" as const,
};

const SYSTEM_TARGET = {
  kind: "system" as const,
  id: "system",
};

export function buildProjectCommandItems(input: BuildProjectCommandItemsInput): ProjectCommandItem[] {
  const activeProjectId = input.activeProjectId;
  const projectScope = activeProjectId
    ? { projectId: activeProjectId, mode: "current" as const }
    : { projectId: null, mode: "all" as const };
  const projectTarget = activeProjectId
    ? { kind: "project" as const, id: activeProjectId }
    : { kind: "workspace" as const, id: "all-projects" };
  const projectPrefix = activeProjectId ? `/projects/${activeProjectId}` : "";
  const searchHref = activeProjectId ? `/search?project=${activeProjectId}` : "/search?scope=all";

  return [
    nav("home", "Dashboard", activeProjectId ? `/?project=${activeProjectId}` : "/", projectScope, projectTarget),
    nav("projects", "Projects", "/projects", projectScope, projectTarget),
    nav("docs", "Documents", activeProjectId ? `${projectPrefix}/docs` : "/docs", projectScope, projectTarget),
    nav("boards", "Boards", activeProjectId ? `${projectPrefix}/board` : "/boards", projectScope, projectTarget),
    nav("agents", "Agents", "/agents", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("runs", "Agent runs", activeProjectId ? `/runs?project=${activeProjectId}` : "/runs", projectScope, projectTarget),
    nav("artifacts", "Artifacts", activeProjectId ? `/artifacts?project=${activeProjectId}` : "/artifacts", projectScope, projectTarget),
    nav("repos", "Repositories", activeProjectId ? `${projectPrefix}/repos` : "/repos", projectScope, projectTarget),
    nav("memory", "Memory", activeProjectId ? `/memory?project=${activeProjectId}` : "/memory", projectScope, projectTarget),
    nav("context", "Context", activeProjectId ? `/context/preview?project=${activeProjectId}` : "/context/preview", projectScope, projectTarget),
    nav("orchestration", "Orchestration", "/orchestration", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("audit", "Audit", activeProjectId ? `/audit?project=${activeProjectId}` : "/audit", projectScope, projectTarget),
    nav("search", "Search", searchHref, projectScope, projectTarget),
    nav("doctor", "Doctor", "/doctor", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("inference", "Inference Settings", "/settings/inference", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("skills", "Skills Settings", "/settings/skills", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("notifications", "Notification Settings", "/settings/notifications", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("workflow-settings", "Workflow Settings", "/settings/orchestration", SYSTEM_SCOPE, SYSTEM_TARGET),
    nav("data-settings", "Data Settings", "/settings/data", SYSTEM_SCOPE, SYSTEM_TARGET),
    mutate("create-task", "New task", activeProjectId ? `${projectPrefix}/board?new=task` : "/boards?new=task", projectScope, projectTarget),
    mutate("create-doc", "New doc", activeProjectId ? `${projectPrefix}/docs/new` : "/docs/new", projectScope, projectTarget),
  ];
}

function nav(
  id: string,
  label: string,
  href: string,
  scope: ProjectCommandItem["scope"],
  traceTarget: ProjectCommandItem["traceTarget"],
): ProjectCommandItem {
  return { id, label, href, scope, traceTarget, mutation: false };
}

function mutate(
  id: string,
  label: string,
  href: string,
  scope: ProjectCommandItem["scope"],
  traceTarget: ProjectCommandItem["traceTarget"],
): ProjectCommandItem {
  return { id, label, href, scope, traceTarget, mutation: true };
}
