<script lang="ts">
  type SourceKind = "plan" | "diff" | "prototype" | "annotation" | "feedback";
  type Status = "open" | "resolved" | "blocker";

  type ReviewItem = {
    id: string;
    text: string;
    kind: SourceKind;
    author: string;
    status: Status;
    target: { file?: string; planSection?: string; artifact?: string };
  };

  const ITEMS: ReviewItem[] = [
    { id: "r1", text: "Migration script missing rollback for projects_search index.", kind: "annotation", author: "alice", status: "blocker", target: { file: "migrations/2026-05-12-projects-search.ts" } },
    { id: "r2", text: "Plan section 3.2 references retired endpoint /v1/items.", kind: "plan", author: "bob", status: "open", target: { planSection: "3.2 API surface" } },
    { id: "r3", text: "Prototype shows wrong copy for empty state in onboarding.", kind: "prototype", author: "carol", status: "open", target: { artifact: "fig-onboarding-v3" } },
    { id: "r4", text: "Diff in auth.ts removes the rate-limit guard; intentional?", kind: "diff", author: "dave", status: "blocker", target: { file: "apps/server/src/auth.ts" } },
    { id: "r5", text: "Feedback batch accepted by lead after resolving copy nits.", kind: "feedback", author: "eve", status: "resolved", target: { planSection: "Copy review" } },
    { id: "r6", text: "Annotation: timezone handling in cycle save uses local time.", kind: "annotation", author: "alice", status: "open", target: { file: "apps/web/src/routes/project-settings/+page.svelte" } },
  ];

  let query = $state("");
  let kindFilter = $state<SourceKind | "all">("all");
  let statusFilter = $state<Status | "any">("any");
  let authorFilter = $state("");
  let activeSource = $state<"main" | "split">("main");
  let jumped = $state<string | null>(null);

  const filtered = $derived(
    ITEMS.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (statusFilter !== "any" && item.status !== statusFilter) return false;
      if (authorFilter && !item.author.toLowerCase().includes(authorFilter.toLowerCase())) return false;
      if (query) {
        const hay = `${item.text} ${item.target.file ?? ""} ${item.target.planSection ?? ""} ${item.target.artifact ?? ""}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    }),
  );

  function jumpTo(id: string): void {
    jumped = id;
  }

  function switchSource(): void {
    activeSource = activeSource === "main" ? "split" : "main";
  }

  function targetLabel(t: ReviewItem["target"]): string {
    return t.file ?? t.planSection ?? t.artifact ?? "(no target)";
  }
</script>

<svelte:head>
  <title>Review search | Fulcrum</title>
</svelte:head>

<main class="mx-auto max-w-4xl space-y-6 p-6" data-review-search-page>
  <header class="space-y-1">
    <h1 class="text-2xl font-semibold">Review search</h1>
    <p class="text-sm text-muted-foreground">Search plans, diffs, prototypes, annotations, and feedback in one session.</p>
  </header>

  <section class="space-y-3 rounded-md border border-border p-4" data-review-controls>
    <div class="flex flex-wrap items-center gap-3">
      <input
        type="search"
        data-review-query
        bind:value={query}
        placeholder="Search annotations, files, sections, artifacts"
        class="flex-1 min-w-[16rem] rounded-md border border-border bg-background px-3 py-2 text-sm"
        aria-label="Search review content"
      />
      <button type="button" data-review-switch-source onclick={switchSource} class="rounded-md border border-border px-3 py-2 text-xs">
        Source: {activeSource}
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-xs">
        Kind
        <select data-review-filter-kind bind:value={kindFilter} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
          <option value="all">all</option>
          <option value="plan">plan</option>
          <option value="diff">diff</option>
          <option value="prototype">prototype</option>
          <option value="annotation">annotation</option>
          <option value="feedback">feedback</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-xs">
        Status
        <select data-review-filter-status bind:value={statusFilter} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
          <option value="any">any</option>
          <option value="open">unresolved</option>
          <option value="blocker">blocker</option>
          <option value="resolved">resolved</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-xs">
        Author
        <input data-review-filter-author bind:value={authorFilter} placeholder="filter by author" class="rounded-md border border-border bg-background px-2 py-1 text-xs" />
      </label>
    </div>
  </section>

  <section data-review-results class="space-y-2">
    <p class="text-xs text-muted-foreground">
      <span data-review-result-count>{filtered.length}</span> match{filtered.length === 1 ? "" : "es"}
    </p>
    {#if filtered.length === 0}
      <p data-review-empty class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No matches. Loosen filters or clear search.</p>
    {:else}
      <ul class="space-y-2">
        {#each filtered as item}
          <li
            data-review-row={item.id}
            data-review-kind={item.kind}
            data-review-status={item.status}
            class="space-y-1 rounded-md border border-border p-3"
          >
            <p class="text-sm">{item.text}</p>
            <p class="text-xs text-muted-foreground">
              <span data-review-author>{item.author}</span> · <span data-review-target>{targetLabel(item.target)}</span>
            </p>
            <button type="button" data-review-jump={item.id} onclick={() => jumpTo(item.id)} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
              Jump to {item.kind}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if jumped}
      <p data-review-jumped class="text-xs text-primary">Jumped to {jumped}.</p>
    {/if}
  </section>
</main>
