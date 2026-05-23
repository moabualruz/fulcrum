<script lang="ts">
  type Run = { id: string; parentId: string | null; forkEventId: string | null; title: string; status: "running" | "paused" | "done" };

  let runs = $state<Run[]>([
    { id: "r1", parentId: null, forkEventId: null, title: "Refactor flow", status: "running" },
  ]);
  let activeId = $state<string>("r1");
  let pauseMenuOpen = $state(false);

  function pause(): void {
    runs = runs.map((r) => (r.id === activeId ? { ...r, status: "paused" } : r));
    pauseMenuOpen = true;
  }

  function fork(): void {
    const parent = runs.find((r) => r.id === activeId);
    if (!parent) return;
    const newId = `r${runs.length + 1}`;
    runs = [...runs, { id: newId, parentId: parent.id, forkEventId: "evt-current", title: `${parent.title} (fork)`, status: "running" }];
    pauseMenuOpen = false;
  }

  function setActive(id: string): void { activeId = id; }
</script>

<svelte:head><title>Run fork | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-run-fork-page>
  <h1 class="text-2xl font-semibold">Run fork</h1>

  <section data-run-feed class="space-y-2">
    {#each runs as r}
      <button
        type="button"
        data-run-row={r.id}
        data-run-active={r.id === activeId}
        data-run-parent={r.parentId ?? ""}
        data-run-status={r.status}
        onclick={() => setActive(r.id)}
        class="block w-full rounded-md border border-border bg-background p-3 text-left text-sm"
      >
        <strong>{r.title}</strong>
        <span class="text-xs text-muted-foreground"> · {r.status}{r.parentId ? ` · fork of ${r.parentId}` : ""}</span>
      </button>
    {/each}
  </section>

  <div class="flex gap-2">
    <button type="button" data-run-pause onclick={pause} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Pause</button>
  </div>

  {#if pauseMenuOpen}
    <ul data-run-pause-menu class="space-y-1 rounded-md border border-border p-2 text-xs">
      <li><button type="button" data-run-fork onclick={fork} class="w-full text-left">Fork from here</button></li>
    </ul>
  {/if}
</main>
