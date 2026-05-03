<script lang="ts">
  import type { PageData } from "./$types";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";
  import {
    MEMORY_IMPORTANCE,
    MEMORY_KINDS,
    MEMORY_SOURCES,
    buildMemoryListInput,
    createDebouncedMemorySearch,
    optimisticMemoryAction,
    previewMemory,
    type MemoryRow,
  } from "$lib/memory/memory-browser";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let filters = $state({ ...data.filters });
  let query = $state("");
  let memories = $state<MemoryRow[]>([]);
  let selected = $state<string[]>([]);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);
  let tagValue = $state("");

  const searchMemory = createDebouncedMemorySearch((nextQuery: string) => {
    void loadMemories(nextQuery);
  }, 300);

  $effect(() => {
    void loadMemories(query);
  });

  function checked(id: string): boolean {
    return selected.includes(id);
  }

  function toggleSelected(id: string, checkedValue: boolean): void {
    selected = checkedValue ? [...selected, id] : selected.filter((value) => value !== id);
  }

  function updateSearch(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    searchMemory(query);
  }

  function updateFilter(event: Event): void {
    const target = event.currentTarget as HTMLInputElement | HTMLSelectElement;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      filters = { ...filters, [target.name]: target.checked };
    } else {
      filters = { ...filters, [target.name]: target.value };
    }
    void loadMemories(query);
  }

  async function trpc<T>(procedure: string, input: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
    const body = JSON.stringify({ json: input });
    const response = await fetch(`/api/trpc/${procedure}`, {
      method,
      headers: { "content-type": "application/json" },
      body,
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    return (payload.result?.data?.json ?? payload.result?.data ?? payload.json ?? payload) as T;
  }

  async function loadMemories(nextQuery = ""): Promise<void> {
    loading = true;
    errorMessage = null;
    const input = buildMemoryListInput(filters);
    try {
      memories = nextQuery.trim()
        ? await trpc<MemoryRow[]>("memory.search", { ...input, query: nextQuery, topK: 50 })
        : await trpc<MemoryRow[]>("memory.list", input);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Memory request failed.";
    } finally {
      loading = false;
    }
  }

  async function mutateSelected(action: "promote" | "archive" | "tag", tag?: string): Promise<void> {
    const ids = new Set(selected);
    memories = memories.map((memory) => ids.has(memory.id) ? optimisticMemoryAction(memory, action, tag) : memory);
    for (const id of selected) {
      if (action === "promote") {
        await trpc("memory.update", { id, importance: "high" });
      } else if (action === "archive") {
        await trpc("memory.update", { id, archived: true });
      } else if (action === "tag" && tag) {
        const memory = memories.find((item) => item.id === id);
        await trpc("memory.update", { id, tags: memory?.tags ?? [tag] });
      }
    }
    selected = [];
  }

  function bulkPromote(): void {
    void mutateSelected("promote");
  }

  function bulkArchive(): void {
    void mutateSelected("archive");
  }

  function bulkTag(): void {
    if (!tagValue.trim()) return;
    void mutateSelected("tag", tagValue.trim());
    tagValue = "";
  }
</script>

<section data-memory-browser class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Memory</h1>
      <p class={cn("text-sm text-muted-foreground")}>Org memory across projects, runs, docs, and artifacts.</p>
    </div>
    <input
      data-memory-search
      type="search"
      placeholder="Search memory"
      value={query}
      oninput={updateSearch}
      class={cn("h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm")}
    />
  </header>

  <div class={cn("grid gap-4 lg:grid-cols-[16rem_1fr]")}>
    <aside data-memory-filters class={cn("flex flex-col gap-3 rounded-md border border-border p-3")}>
      <input data-memory-filter-project name="projectId" placeholder="Project id" value={filters.projectId} oninput={updateFilter} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")} />
      <select data-memory-filter-kind name="kind" onchange={updateFilter} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}>
        <option value="">All kinds</option>
        {#each MEMORY_KINDS as kind}
          <option value={kind} selected={filters.kind === kind}>{kind}</option>
        {/each}
      </select>
      <select data-memory-filter-importance name="importance" onchange={updateFilter} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}>
        <option value="">All importance</option>
        {#each MEMORY_IMPORTANCE as importance}
          <option value={importance} selected={filters.importance === importance}>{importance}</option>
        {/each}
      </select>
      <input data-memory-filter-tags name="tags" placeholder="Tags" value={filters.tags} oninput={updateFilter} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")} />
      <input data-memory-filter-date-range name="dateRange" placeholder="Date range" value={filters.dateRange} oninput={updateFilter} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")} />
      <select data-memory-filter-source name="source" onchange={updateFilter} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}>
        <option value="">All sources</option>
        {#each MEMORY_SOURCES as source}
          <option value={source} selected={filters.source === source}>{source}</option>
        {/each}
      </select>
      <label class={cn("flex items-center gap-2 text-sm")}>
        <input data-memory-filter-archived name="archived" type="checkbox" checked={filters.archived} onchange={updateFilter} />
        Archived
      </label>
    </aside>

    <div class={cn("flex min-w-0 flex-col gap-3")}>
      {#if selected.length > 0}
        <div data-memory-bulk-bar class={cn("flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted p-2 text-sm")}>
          <span>{selected.length} selected</span>
          <button type="button" class={cn(buttonVariants({ variant: "outline" }), "h-8")} onclick={bulkPromote}>Promote</button>
          <button type="button" class={cn(buttonVariants({ variant: "outline" }), "h-8")} onclick={bulkArchive}>Archive</button>
          <input value={tagValue} oninput={(event) => tagValue = event.currentTarget.value} placeholder="Tag" class={cn("h-8 rounded-md border border-input bg-background px-2 text-sm")} />
          <button type="button" class={cn(buttonVariants({ variant: "outline" }), "h-8")} onclick={bulkTag}>Tag</button>
        </div>
      {/if}

      {#if loading}
        <p class={cn("text-sm text-muted-foreground")}>Loading memory…</p>
      {:else if errorMessage}
        <p class={cn("text-sm text-destructive")}>{errorMessage}</p>
      {:else if memories.length === 0}
        <p data-empty-memory class={cn("rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground")}>No memory matches current filters.</p>
      {:else}
        <div class={cn("divide-y divide-border rounded-md border border-border")}>
          {#each memories as memory (memory.id)}
            <article data-memory-row={memory.id} class={cn("grid gap-2 p-3")}>
              <div class={cn("flex flex-wrap items-center gap-2")}>
                <input type="checkbox" aria-label="Select memory" checked={checked(memory.id)} onchange={(event) => toggleSelected(memory.id, event.currentTarget.checked)} />
                <a href="/memory/{memory.id}" class={cn("font-medium hover:underline")}>{previewMemory(memory.body, 72)}</a>
                <span data-memory-kind class={cn("rounded bg-muted px-2 py-0.5 text-xs")}>{memory.kind}</span>
                <span data-memory-importance class={cn("size-2 rounded-full", memory.importance === "high" ? "bg-red-500" : memory.importance === "medium" ? "bg-amber-500" : "bg-slate-400")}></span>
                <span data-memory-source class={cn("rounded border border-border px-2 py-0.5 text-xs")}>{memory.source}</span>
              </div>
              <p class={cn("text-sm text-muted-foreground")}>{previewMemory(memory.body)}</p>
              {#if memory.tags.length > 0}
                <div class={cn("flex flex-wrap gap-1")}>
                  {#each memory.tags as tag}
                    <span class={cn("rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground")}>{tag}</span>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</section>
