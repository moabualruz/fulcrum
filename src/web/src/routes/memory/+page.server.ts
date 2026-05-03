import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => ({
  activeProjectId: locals.activeProjectId ?? null,
  filters: {
    projectId: url.searchParams.get("project") ?? "",
    kind: url.searchParams.get("kind") ?? "",
    importance: url.searchParams.get("importance") ?? "",
    tags: url.searchParams.get("tags") ?? "",
    dateRange: url.searchParams.get("dateRange") ?? "",
    source: url.searchParams.get("source") ?? "",
    archived: url.searchParams.get("archived") === "true",
  },
});
