<script lang="ts">
  type Item = { id: string; label: string; kind: "task" | "doc" | "project" | "run" };
  const ITEMS: Item[] = [
    { id: "t-1", label: "Refactor cycle save", kind: "task" },
    { id: "t-2", label: "Add fuzzy matching to palette", kind: "task" },
    { id: "d-1", label: "Runbook: cycle close", kind: "doc" },
    { id: "d-2", label: "Onboarding draft", kind: "doc" },
    { id: "p-1", label: "Cycle refactor project", kind: "project" },
    { id: "r-1", label: "Build #431", kind: "run" },
  ];
  const RECENT: string[] = ["t-1", "d-1"];

  let open = $state(false);
  let query = $state("");
  let selected = $state(0);
  let opened = $state<string | null>(null);

  function score(item: Item, q: string): number {
    if (!q) return RECENT.includes(item.id) ? 2 : 1;
    const hay = item.label.toLowerCase();
    const needle = q.toLowerCase();
    if (hay.startsWith(needle)) return 3;
    if (hay.includes(needle)) return 2;
    let i = 0; for (const ch of needle) { const idx = hay.indexOf(ch, i); if (idx === -1) return 0; i = idx + 1; }
    return 1;
  }

  const filtered = $derived(
    ITEMS
      .map((item) => ({ item, score: score(item, query) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.item),
  );

  function handleKey(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); open = true; query = ""; selected = 0; return; }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); open = false; return; }
    if (e.key === "ArrowDown") { e.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); selected = Math.max(0, selected - 1); return; }
    if (e.key === "Enter") { e.preventDefault(); const target = filtered[selected]; if (target) { opened = target.id; open = false; } return; }
  }
</script>

<svelte:head><title>Cmd-K palette | Fulcrum</title></svelte:head>
<svelte:window onkeydown={handleKey} />

<main class="mx-auto max-w-2xl space-y-4 p-6" data-palette-cmdk-page>
  <h1 class="text-2xl font-semibold">Workspace palette</h1>
  <p class="text-sm text-muted-foreground">Press <kbd>Cmd/Ctrl + K</kbd> to open the workspace search palette.</p>
  <button type="button" data-palette-trigger onclick={() => { open = true; query = ""; selected = 0; }} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Open palette</button>

  {#if opened}
    <p data-palette-opened class="text-xs text-primary">Opened: {opened}</p>
  {/if}

  {#if open}
    <div role="dialog" aria-label="Command palette" data-palette-modal class="space-y-2 rounded-md border border-border bg-background p-3">
      <input
        data-palette-input
        type="search"
        bind:value={query}
        placeholder="Search tasks, docs, projects, runs…"
        autofocus
        class="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      <p data-palette-recent-marker class="text-xs text-muted-foreground">{query ? "Matches" : "Recent"}</p>
      <ul class="space-y-1" data-palette-list>
        {#each filtered as item, i}
          <li
            data-palette-row={item.id}
            data-palette-selected={i === selected}
            class={`rounded-md border border-border px-2 py-1 text-sm ${i === selected ? "bg-muted" : ""}`}
          >
            <span data-palette-kind={item.kind} class="mr-2 inline-block rounded-md bg-muted px-1 text-xs">{item.kind}</span>
            {item.label}
          </li>
        {/each}
      </ul>
      <button type="button" data-palette-close onclick={() => (open = false)} aria-label="Close palette" class="rounded-md border border-border px-3 py-1 text-xs">Close (Esc)</button>
    </div>
  {/if}
</main>
