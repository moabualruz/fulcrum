<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { goto } from "$app/navigation";
  import {
    fetchCommandPaletteEntities,
    type ProjectResult,
    type SprintResult,
    type TaskResult,
  } from "./command-palette/entity-api.ts";

  interface ActionItem {
    id: string;
    label: string;
    description?: string;
    action: () => void;
  }

  type ResultGroup =
    | { type: "task"; item: TaskResult }
    | { type: "project"; item: ProjectResult }
    | { type: "sprint"; item: SprintResult }
    | { type: "action"; item: ActionItem };

  interface Props {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    orgId?: string | null;
    userId?: string | null;
    projectId?: string | null;
  }

  let { open, onOpenChange, orgId = null, userId = null, projectId = null }: Props = $props();

  let query = $state("");
  let loading = $state(false);
  let tasks = $state<TaskResult[]>([]);
  let projects = $state<ProjectResult[]>([]);
  let sprints = $state<SprintResult[]>([]);
  let selectedIndex = $state(0);

  const ACTIONS: ActionItem[] = [
    { id: "nav-dashboard",  label: "Go to Dashboard",  action: () => void goto("/") },
    { id: "nav-projects",   label: "Go to Projects",   action: () => void goto("/projects") },
    { id: "nav-boards",     label: "Go to Boards",     action: () => void goto("/boards") },
    { id: "nav-docs",       label: "Go to Documents",  action: () => void goto("/docs") },
    { id: "nav-search",     label: "Search",           action: () => void goto("/search") },
  ];

  const TASK_ID_RE = /^[A-Z]{2,6}-\d+$/i;

  function fuzzyMatch(text: string, q: string): boolean {
    const lower = text.toLowerCase();
    const qLower = q.toLowerCase();
    if (lower.includes(qLower)) return true;
    // Simple fuzzy: all chars of q appear in order in text
    let pos = 0;
    for (const ch of qLower) {
      const idx = lower.indexOf(ch, pos);
      if (idx === -1) return false;
      pos = idx + 1;
    }
    return true;
  }

  const results = $derived<ResultGroup[]>(() => {
    if (!query.trim()) {
      return ACTIONS.slice(0, 5).map((item) => ({ type: "action" as const, item }));
    }

    const q = query.trim();
    const isId = TASK_ID_RE.test(q);

    const matchedTasks: ResultGroup[] = tasks
      .filter((t) =>
        isId
          ? (t.identifier ?? "").toLowerCase().includes(q.toLowerCase())
          : fuzzyMatch(t.title, q)
      )
      .slice(0, 5)
      .map((item) => ({ type: "task" as const, item }));

    const matchedProjects: ResultGroup[] = projects
      .filter((p) => fuzzyMatch(p.name, q))
      .slice(0, 3)
      .map((item) => ({ type: "project" as const, item }));

    const matchedSprints: ResultGroup[] = sprints
      .filter((s) => fuzzyMatch(s.name, q))
      .slice(0, 3)
      .map((item) => ({ type: "sprint" as const, item }));

    const matchedActions: ResultGroup[] = ACTIONS.filter((a) =>
      fuzzyMatch(a.label, q)
    ).map((item) => ({ type: "action" as const, item }));

    return [...matchedTasks, ...matchedProjects, ...matchedSprints, ...matchedActions];
  });

  function close() {
    onOpenChange(false);
    query = "";
    selectedIndex = 0;
  }

  function selectResult(result: ResultGroup) {
    if (result.type === "task") {
      void goto(`/projects/${result.item.projectId}/tasks/${result.item.id}`);
    } else if (result.type === "project") {
      void goto(`/projects/${result.item.id}`);
    } else if (result.type === "sprint") {
      void goto(`/projects/${result.item.projectId}/sprints/${result.item.id}`);
    } else if (result.type === "action") {
      result.item.action();
    }
    close();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[selectedIndex];
      if (selected) selectResult(selected);
    }
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) close();
  }

  $effect(() => {
    if (selectedIndex >= results.length) selectedIndex = Math.max(0, results.length - 1);
  });

  $effect(() => {
    if (!open) return;
    if (tasks.length > 0 || projects.length > 0 || loading) return;

    loading = true;
    fetchCommandPaletteEntities(fetch, { orgId, userId, projectId })
      .then((entities) => {
        tasks = entities.tasks;
        projects = entities.projects;
        sprints = entities.sprints;
      })
      .catch(() => {
        tasks = [];
        projects = [];
        sprints = [];
      })
      .finally(() => {
        loading = false;
      });
  });

  function groupLabel(type: ResultGroup["type"]): string {
    switch (type) {
      case "task": return "Tasks";
      case "project": return "Projects";
      case "sprint": return "Sprints";
      case "action": return "Actions";
    }
  }

  function resultIcon(type: ResultGroup["type"]): string {
    switch (type) {
      case "task": return "□";
      case "project": return "◈";
      case "sprint": return "⟳";
      case "action": return "→";
    }
  }

  function resultLabel(result: ResultGroup): string {
    if (result.type === "task") return result.item.identifier ? `${result.item.identifier} ${result.item.title}` : result.item.title;
    if (result.type === "project") return result.item.name;
    if (result.type === "sprint") return result.item.name;
    return result.item.label;
  }

  const groupedResults = $derived<Array<{ type: ResultGroup["type"]; items: ResultGroup[] }>>(() => {
    const groups = new Map<ResultGroup["type"], ResultGroup[]>();
    for (const r of results) {
      const arr = groups.get(r.type) ?? [];
      arr.push(r);
      groups.set(r.type, arr);
    }
    return Array.from(groups.entries()).map(([type, items]) => ({ type, items }));
  });

  let flatIndex = $derived(
    results.findIndex((_r, i) => i === selectedIndex)
  );
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    class={cn("fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-16 px-4")}
    onclick={handleBackdrop}
    onkeydown={handleKeydown}
  >
    <div
      class={cn(
        "w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl",
      )}
    >
      <!-- Search input -->
      <div class="relative flex items-center border-b border-border">
        <span class="absolute left-3 text-muted-foreground text-sm" aria-hidden="true">⌘</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          autofocus
          type="text"
          bind:value={query}
          placeholder="Search tasks, projects, or type a command..."
          aria-label="Command search"
          aria-autocomplete="list"
          class={cn(
            "h-12 w-full bg-transparent pl-9 pr-4 text-sm outline-none",
            "placeholder:text-muted-foreground",
          )}
        />
        {#if loading}
          <span class="absolute right-3 text-muted-foreground text-xs" aria-live="polite">loading…</span>
        {/if}
      </div>

      <!-- Results -->
      <ul
        role="listbox"
        aria-label="Search results"
        class={cn("max-h-80 overflow-y-auto p-2")}
      >
        {#if results.length === 0}
          <li class="px-3 py-6 text-center text-sm text-muted-foreground">No results</li>
        {:else}
          {#each groupedResults as group (group.type)}
            <li role="presentation">
              <div class="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {groupLabel(group.type)}
              </div>
              <ul role="group" aria-label={groupLabel(group.type)}>
                {#each group.items as result, _i (result.type + (result.type === "action" ? result.item.id : result.item.id))}
                  {@const flatIdx = results.indexOf(result)}
                  <li role="option" aria-selected={flatIdx === selectedIndex}>
                    <button
                      type="button"
                      onclick={() => selectResult(result)}
                      onmouseenter={() => { selectedIndex = flatIdx; }}
                      class={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm",
                        flatIdx === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <span class="shrink-0 text-muted-foreground" aria-hidden="true">
                        {resultIcon(result.type)}
                      </span>
                      <span class="truncate">{resultLabel(result)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </li>
          {/each}
        {/if}
      </ul>

      <!-- Footer hint -->
      <div class={cn("flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground")}>
        <span><kbd class="font-mono">↑↓</kbd> navigate</span>
        <span><kbd class="font-mono">Enter</kbd> select</span>
        <span><kbd class="font-mono">Esc</kbd> close</span>
      </div>
    </div>
  </div>
{/if}
