<script lang="ts">
  import { Avatar, AvatarFallback, Chip, EmptyState, ModeRow, Progress, StatusBadge } from "@fulcrum/ui-kit";
  import type { WorkflowStatus } from "@fulcrum/ui-kit";
  import { page } from "$app/state";
  import { cn } from "@fulcrum/ui-kit";

  /**
   * Build · List: the `☰ List` layout of the Build workbench.
   *
   * OD reference: `build-list.html`: a dense (12px body / 20px row) work-item
   * table with columns ID · Title · Status · Progress · Module · Owner ·
   * Updated · Modes. Sticky header, monospace id pills, `DESIGN.md §4.9`
   * status badges, a per-row 60px progress bar, an avatar, and a `DESIGN.md
   * §4.11` compact mode row per row. The page header carries the OD
   * `view-switch` nav (Board · Graph · List · Timeline · Runs) and a work-item
   * count; a shared filter chip row sits below it. List · Board · Graph ·
   * Timeline · Runs share one header, one filter chip row, and one layout
   * switcher (`design-alignment/build.md` → build-list.html migration notes).
   */

  /** A Build work-item row (`IA-MAP.md §2.3` build lifecycle). */
  type WorkItem = {
    id: string;
    title: string;
    status: WorkflowStatus;
    progress: number;
    module: string;
    owner: string;
    updated: string;
    /** The mode selected on this row's compact ModeRow. */
    mode: "manual" | "play" | "discuss" | "assist";
  };

  /**
   * The OD `build-list.html` body: eight work items, verbatim ids/titles/
   * modules/owners/updated. OD status strings map onto the canonical
   * `DESIGN.md §4.9` / COPY.md §6 vocabulary: `complete`→`completed`,
   * `awaiting`→`waiting-input`, `pending`→`queued`.
   */
  const workItems: WorkItem[] = [
    { id: "FUL-1284", title: "Rework token refresh for offline mode", status: "running", progress: 65, module: "auth", owner: "m", updated: "2m ago", mode: "manual" },
    { id: "FUL-1283", title: "Trace explorer cross-surface stitch", status: "running", progress: 56, module: "obs", owner: "s", updated: "5m ago", mode: "manual" },
    { id: "FUL-1281", title: "MCP health rollup on operate doctor", status: "waiting-input", progress: 80, module: "operate", owner: "m", updated: "22m ago", mode: "manual" },
    { id: "FUL-1276", title: "Drag-and-drop keyboard fallback (board)", status: "blocked", progress: 32, module: "ui", owner: "a", updated: "1h ago", mode: "manual" },
    { id: "FUL-1274", title: "Sugiyama layered graph engine", status: "completed", progress: 100, module: "ui", owner: "s", updated: "2h ago", mode: "manual" },
    { id: "FUL-1268", title: "Status footer parity across TUI + web", status: "completed", progress: 100, module: "shell", owner: "m", updated: "yesterday", mode: "manual" },
    { id: "FUL-1265", title: "Run envelope schema for legacy CLI clients", status: "queued", progress: 8, module: "protocol", owner: "m", updated: "2d ago", mode: "manual" },
    { id: "FUL-1261", title: "Plan templates library + seeding", status: "running", progress: 42, module: "plan", owner: "s", updated: "3d ago", mode: "manual" },
  ];

  /** The five Build layouts: one switcher shared across board / list / timeline / graph / runs. */
  const layouts = [
    { id: "board", label: "Board", href: "/build-board" },
    { id: "graph", label: "Graph", href: "/build-graph" },
    { id: "list", label: "List", href: "/build-list" },
    { id: "timeline", label: "Timeline", href: "/build-timeline" },
    { id: "runs", label: "Runs", href: "/build-runs" },
  ] as const;

  /**
   * The shared filter chip row (OD `.filters`). The first chip is the active
   * scope; selecting another chip narrows the visible work items. The chip row
   * is identical to the board's so navigating the layout switcher never loses
   * the operator's filter context.
   */
  type FilterId = "all" | "running" | "blocked" | "awaiting" | "mine" | "cycle:24w13" | "module:auth";
  const filters: { id: FilterId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "running", label: "Running" },
    { id: "blocked", label: "Blocked" },
    { id: "awaiting", label: "Awaiting review" },
    { id: "mine", label: "Mine" },
    { id: "cycle:24w13", label: "cycle:24w13" },
    { id: "module:auth", label: "module:auth" },
  ];
  let activeFilter = $state<FilterId>("all");

  /** The signed-in operator: used by the `Mine` filter. */
  const currentOwner = "m";

  const visibleItems = $derived(
    workItems.filter((item) => {
      switch (activeFilter) {
        case "all":
          return true;
        case "running":
          return item.status === "running";
        case "blocked":
          return item.status === "blocked";
        case "awaiting":
          return item.status === "waiting-input";
        case "mine":
          return item.owner === currentOwner;
        case "cycle:24w13":
          return true;
        case "module:auth":
          return item.module === "auth";
        default:
          return true;
      }
    }),
  );

  /**
   * The two declared data states (`populated` | `empty`). `populated` is the
   * default; `?state=empty` renders the COPY.md build-list empty state. This
   * is a design-surface state selector, not a production data source: the
   * real list will derive its empty state from a zero-length task query.
   */
  const isEmptyState = $derived(page.url.searchParams.get("state") === "empty");

  /** Header count: OD `42 work items · 12 running`, recomputed from the data. */
  const totalCount = workItems.length;
  const runningCount = $derived(workItems.filter((item) => item.status === "running").length);

  /** Columns for the dense work-item table (OD `<thead>` order). */
  const columns = [
    { id: "id", label: "ID", width: "9rem" },
    { id: "title", label: "Title", width: "auto" },
    { id: "status", label: "Status", width: "8rem" },
    { id: "progress", label: "Progress", width: "6.5rem" },
    { id: "module", label: "Module", width: "6rem" },
    { id: "owner", label: "Owner", width: "5.5rem" },
    { id: "updated", label: "Updated", width: "6.5rem" },
    { id: "modes", label: "Modes", width: "9.5rem" },
  ] as const;

  /** Keyboard navigation: ↑/↓ moves row focus, Home/End jump to the ends. */
  function handleRowKeydown(event: KeyboardEvent, index: number): void {
    const rows = event.currentTarget instanceof HTMLElement
      ? Array.from(event.currentTarget.closest("tbody")?.querySelectorAll<HTMLElement>("[data-build-list-row]") ?? [])
      : [];
    if (rows.length === 0) return;
    let nextIndex = index;
    if (event.key === "ArrowDown") nextIndex = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = rows.length - 1;
    else return;
    event.preventDefault();
    rows[nextIndex]?.focus();
  }
</script>

<svelte:head>
  <title>Build · List</title>
</svelte:head>

<section data-build-list class={cn("flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden")}>
  <header data-build-list-header class={cn("flex flex-col gap-3 border-b border-border bg-background px-4 py-3")}>
    <div class={cn("flex flex-wrap items-baseline gap-3")}>
      <div>
        <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Build</p>
        <h1 class={cn("text-h2 font-semibold")}>Build · List</h1>
      </div>
      <span data-build-list-count class={cn("font-mono text-xs text-muted-foreground")}>
        {totalCount} work items · {runningCount} running
      </span>
      <span class={cn("flex-1")}></span>
      <nav data-build-list-layouts class={cn("flex items-center overflow-hidden rounded-md border border-border")} aria-label="Build views">
        {#each layouts as layout (layout.id)}
          <a
            href={layout.href}
            aria-current={layout.id === "list" ? "page" : undefined}
            data-build-layout={layout.id}
            class={cn(
              "border-r border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground last:border-r-0 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              layout.id === "list" && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            {layout.label}
          </a>
        {/each}
      </nav>
    </div>
  </header>

  <div data-build-list-filters class={cn("flex items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/30 px-4 py-2")}>
    {#each filters as filter (filter.id)}
      <Chip
        data-build-filter={filter.id}
        data-active={activeFilter === filter.id ? "true" : undefined}
        tone={activeFilter === filter.id ? "accent" : "neutral"}
        role="button"
        tabindex={0}
        aria-pressed={activeFilter === filter.id}
        class={cn("cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
        onclick={() => { activeFilter = filter.id; }}
        onkeydown={(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activeFilter = filter.id;
          }
        }}
      >
        {filter.label}
      </Chip>
    {/each}
  </div>

  <div
    data-build-list-table-wrap
    class={cn("@container flex-1 overflow-auto bg-background")}
    style:container-type="inline-size"
  >
    {#if isEmptyState || visibleItems.length === 0}
      <div data-build-list-empty class={cn("px-4 py-10")}>
        <EmptyState
          title="No tasks yet."
          description="Materialize an approved plan, or press c to create a task directly."
        >
          {#snippet icon()}
            <span aria-hidden="true">☰</span>
          {/snippet}
          {#snippet actions()}
            <a
              href="/plan-review"
              data-build-list-empty-action="materialize"
              class={cn("rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
            >Materialize plan</a>
            <a
              href="/tasks"
              data-build-list-empty-action="new-task"
              class={cn("rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
            >New task</a>
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <table data-build-list-table class={cn("w-full border-collapse text-xs")}>
        <thead>
          <tr>
            {#each columns as column (column.id)}
              <th
                scope="col"
                data-build-list-column={column.id}
                style:width={column.width === "auto" ? undefined : column.width}
                class={cn(
                  "sticky top-0 z-10 border-b border-border bg-muted/40 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                  (column.id === "module" || column.id === "owner" || column.id === "updated") &&
                    "@max-[720px]:hidden",
                )}
              >
                {column.label}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each visibleItems as item, index (item.id)}
            <tr
              data-build-list-row
              data-task-id={item.id}
              data-status={item.status}
              tabindex="0"
              onkeydown={(event) => handleRowKeydown(event, index)}
              class={cn(
                "h-5 border-b border-border/60 align-middle hover:bg-muted/30",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
              )}
            >
              <td data-build-list-cell="id" class={cn("px-3 py-0.5")}>
                <a
                  href={`/tasks/${item.id}`}
                  data-build-list-id-pill
                  class={cn("font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
                >{item.id}</a>
              </td>
              <td data-build-list-cell="title" class={cn("px-3 py-0.5 font-medium text-foreground")}>
                {item.title}
              </td>
              <td data-build-list-cell="status" class={cn("px-3 py-0.5")}>
                <StatusBadge status={item.status} />
              </td>
              <td data-build-list-cell="progress" class={cn("px-3 py-0.5")}>
                <Progress
                  value={item.progress}
                  data-build-list-progress
                  class={cn("h-1 w-[60px]")}
                  aria-label={`${item.title} progress ${item.progress}%`}
                />
              </td>
              <td
                data-build-list-cell="module"
                class={cn("px-3 py-0.5 text-muted-foreground @max-[720px]:hidden")}
              >{item.module}</td>
              <td
                data-build-list-cell="owner"
                class={cn("px-3 py-0.5 @max-[720px]:hidden")}
              >
                <Avatar
                  size="xs"
                  data-build-list-owner
                  aria-label={`Owner ${item.owner}`}
                >
                  <AvatarFallback class={cn("bg-accent/15 text-[10px] font-semibold text-accent-foreground")}>
                    {item.owner.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </td>
              <td
                data-build-list-cell="updated"
                class={cn("px-3 py-0.5 font-mono text-[11px] text-muted-foreground @max-[720px]:hidden")}
              >{item.updated}</td>
              <td data-build-list-cell="modes" class={cn("px-3 py-0.5")}>
                <ModeRow
                  density="compact"
                  value={item.mode}
                  ariaLabel={`Modes for ${item.id}`}
                  data-build-list-mode-row
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
