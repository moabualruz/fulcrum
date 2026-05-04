export const PROJECT_VIEWS = ["board", "table", "calendar", "timeline", "list"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

const STORAGE_KEY = "fulcrum:last-project-view";

export function isProjectView(value: string | null): value is ProjectView {
  return PROJECT_VIEWS.includes(value as ProjectView);
}

export function rememberProjectView(view: ProjectView, storage: Pick<Storage, "setItem"> | null = null): void {
  storage?.setItem(STORAGE_KEY, view);
}

export function getInitialProjectView(storage: Pick<Storage, "getItem"> | null = null): ProjectView {
  const value = storage?.getItem(STORAGE_KEY) ?? null;
  return isProjectView(value) ? value : "board";
}

export function projectViewHref(projectId: string, view: ProjectView): string {
  return `/projects/${projectId}/${view}`;
}
