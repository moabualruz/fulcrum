<script lang="ts">
  type EntityKind = "project" | "cycle" | "module" | "task" | "doc" | "run" | "saved-view";
  type Watchable = { id: string; kind: EntityKind; label: string };
  type WatchEntry = { kind: EntityKind; id: string };

  const ENTITIES: Watchable[] = [
    { id: "p1", kind: "project", label: "Cycle refactor" },
    { id: "c1", kind: "cycle", label: "Sprint 12" },
    { id: "m1", kind: "module", label: "Schema" },
    { id: "T1", kind: "task", label: "Migrate cycle.ts" },
    { id: "d1", kind: "doc", label: "Runbook" },
    { id: "r1", kind: "run", label: "Build #431" },
    { id: "v1", kind: "saved-view", label: "Open blockers" },
  ];

  let watches = $state<WatchEntry[]>([{ kind: "task", id: "T1" }]);

  function isWatched(kind: EntityKind, id: string): boolean {
    return watches.some((w) => w.kind === kind && w.id === id);
  }

  function toggle(kind: EntityKind, id: string): void {
    watches = isWatched(kind, id) ? watches.filter((w) => !(w.kind === kind && w.id === id)) : [...watches, { kind, id }];
  }
</script>

<svelte:head><title>Watch list | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-watch-list-page>
  <h1 class="text-2xl font-semibold">Watch list</h1>

  <ul class="space-y-2" data-watch-entities>
    {#each ENTITIES as e}
      <li
        data-watch-entity={`${e.kind}:${e.id}`}
        data-watch-on={isWatched(e.kind, e.id)}
        class="flex items-center justify-between rounded-md border border-border p-3"
      >
        <span class="text-sm">{e.kind}: {e.label}</span>
        <button type="button" data-watch-toggle={`${e.kind}:${e.id}`} onclick={() => toggle(e.kind, e.id)} class="rounded-md border border-border bg-background px-2 py-0.5 text-xs">
          {isWatched(e.kind, e.id) ? "Unwatch" : "Watch"}
        </button>
      </li>
    {/each}
  </ul>

  <p class="text-xs text-muted-foreground">Watching <span data-watch-count>{watches.length}</span> entities.</p>
</main>
