<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { PROJECT_VIEWS, projectViewHref, rememberProjectView, type ProjectView } from "./view-switcher";

  interface Props {
    projectId: string;
    active: ProjectView;
  }

  const { projectId, active }: Props = $props();

  function label(view: ProjectView): string {
    return view[0]!.toUpperCase() + view.slice(1);
  }

  function onClick(view: ProjectView): void {
    if (typeof window !== "undefined") rememberProjectView(view, window.localStorage);
  }
</script>

<nav data-project-view-switcher class={cn("flex flex-wrap items-center gap-1 border-b border-border pb-3")} aria-label="Project views">
  {#each PROJECT_VIEWS as view (view)}
    <a
      data-project-view={view}
      href={projectViewHref(projectId, view)}
      aria-current={view === active ? "page" : undefined}
      onclick={() => onClick(view)}
      class={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium",
        view === active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label(view)}
    </a>
  {/each}
</nav>
