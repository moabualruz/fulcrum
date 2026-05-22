<script lang="ts">
  /**
   * Build · Board: the OD `build-board.html` workbench.
   *
   * The default Build-stage layout (`IA-MAP.md §2.3`, canonical route
   * `/<ws>/projects/<projId>/build/board`): a horizontally-scrolling status
   * board grouped by the canonical status vocabulary, a five-layout switcher
   * tablist, group/sort/properties/filter controls, a filter-chip row, and
   * per-card task rows that each carry the universal `DESIGN.md §4.11` mode
   * affordance row.
   *
   * Composes `@fulcrum/ui-kit` primitives only (Badge / Button / Chip /
   * EmptyState / ErrorBanner / FieldError / Input / Kbd / StatusBadge) plus the
   * shared `mode-affordance-host` ModeRow. The optimistic-create + inline
   * rollback recovery behavior (`OptimisticStore` / `OptimisticRollback` /
   * `ErrorBanner`) is the inline-recovery contract the production board needs;
   * it is carried forward here, not discarded (`design-alignment/build.md`).
   *
   * Project creation, integrations, API tokens, and webhooks are NOT Build-board
   * concerns and have been removed from this route: they live in their own
   * surfaces (`/projects`, `/onboarding`, `/api-tokens`, workspace settings).
   * See the `design-alignment/build.md` route-disposition table.
   */
  import { Badge, Button, Chip, EmptyState, ErrorBanner, FieldError, Input, Kbd, StatusBadge } from "@fulcrum/ui-kit";
  import type { WorkflowStatus } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";
  import {
    ModeRow,
    createStepModeRow,
    modeAffordanceHooks,
  } from "$lib/components/app/mode-affordance-host.ts";
  import {
    OptimisticRollback,
    OptimisticStore,
    ROLLBACK_SUGGESTED_ACTIONS,
    ROLLBACK_TROUBLESHOOTING_HREF,
    ROLLBACK_TROUBLESHOOTING_LABEL,
    type OptimisticEntry,
    type RollbackFailure,
  } from "$lib/optimistic/index.ts";

  type PendingTask = { columnId: string; title: string };

  const optimisticTasks = new OptimisticStore<PendingTask>();
  const optimisticRollback = new OptimisticRollback();
  let optimisticEntries = $state<ReadonlyArray<OptimisticEntry<PendingTask>>>([]);
  let rollbackFailures = $state<ReadonlyArray<RollbackFailure>>([]);
  optimisticTasks.subscribe((entries) => { optimisticEntries = entries; });
  optimisticRollback.subscribe((failures) => { rollbackFailures = failures; });

  let optimisticSequence = 0;
  function nextOptimisticId(): string {
    optimisticSequence += 1;
    return `opt-${optimisticSequence}`;
  }

  function pendingFor(columnId: string): ReadonlyArray<OptimisticEntry<PendingTask>> {
    return optimisticEntries.filter((entry) =>
      entry.value.columnId === columnId &&
      (entry.status === "pending" || entry.status === "failed"),
    );
  }

  function rollbackFor(id: string): RollbackFailure | undefined {
    return rollbackFailures.find((f) => f.id === id);
  }

  function persistOptimisticTask(id: string, value: PendingTask): void {
    optimisticRollback.clear(id);
    const handle = optimisticTasks.apply(id, value);
    void simulateMutationResult(value.title).then((result) => {
      if (result.kind === "success") {
        handle.confirm({ traceId: result.traceId });
        optimisticRollback.resolve(id);
      } else {
        handle.fail({ message: result.message, traceId: result.traceId });
        optimisticRollback.recordFailure({
          id,
          error: result.message,
          traceId: result.traceId,
          payload: { title: value.title, columnId: value.columnId },
        });
      }
    });
  }

  function retryOptimisticTask(id: string): void {
    const entry = optimisticEntries.find((e) => e.id === id);
    if (!entry) return;
    const handle = optimisticTasks.apply(id, entry.value);
    void simulateMutationResult(entry.value.title).then((result) => {
      if (result.kind === "success") {
        handle.confirm({ traceId: result.traceId });
        optimisticRollback.resolve(id);
      } else {
        handle.fail({ message: result.message, traceId: result.traceId });
        optimisticRollback.recordFailure({
          id,
          error: result.message,
          traceId: result.traceId,
          payload: { title: entry.value.title, columnId: entry.value.columnId },
        });
      }
    });
  }

  function undoOptimisticTask(id: string): void {
    optimisticTasks.remove(id);
    optimisticRollback.resolve(id);
  }

  function dismissOptimisticTask(id: string): void {
    optimisticTasks.remove(id);
    optimisticRollback.resolve(id);
  }

  type SimulatedResult =
    | { kind: "success"; traceId: string }
    | { kind: "failure"; message: string; traceId: string };

  async function simulateMutationResult(title: string): Promise<SimulatedResult> {
    await new Promise((resolve) => setTimeout(resolve, 750));
    if (title.toLowerCase().includes("force-fail")) {
      return {
        kind: "failure",
        message: "Server rejected the mutation (HTTP 500).",
        traceId: "tr_optimistic_5xx",
      };
    }
    return { kind: "success", traceId: "tr_optimistic_ok" };
  }

  const ROLLBACK_TROUBLESHOOTING = {
    href: ROLLBACK_TROUBLESHOOTING_HREF,
    label: ROLLBACK_TROUBLESHOOTING_LABEL,
    actions: ROLLBACK_SUGGESTED_ACTIONS,
  };

  type ErrorDemoState =
    | { kind: "idle" }
    | { kind: "validation"; field: "title"; reason: string }
    | { kind: "network"; message: string; traceId: string; surface: "row" | "form" | "drawer" | "block" }
    | { kind: "unexpected"; message: string; traceId: string; stack: string };

  let errorDemo = $state<ErrorDemoState>({ kind: "idle" });
  let errorDemoTitle = $state("");

  function triggerValidationError(): void {
    errorDemoTitle = "";
    errorDemo = { kind: "validation", field: "title", reason: "Title is required." };
  }

  function triggerNetworkError(): void {
    errorDemo = {
      kind: "network",
      message: "Network request failed before reaching the server.",
      traceId: "tr_err_5xx",
      surface: "form",
    };
  }

  function triggerUnexpectedError(): void {
    errorDemo = {
      kind: "unexpected",
      message: "Unexpected error while saving the task.",
      traceId: "tr_err_unexpected",
      stack: [
        "TypeError: Cannot read properties of undefined (reading 'id')",
        "  at submitInlineCreate (build-board/+page.svelte:120:7)",
        "  at handleCreateKeydown (build-board/+page.svelte:88:9)",
      ].join("\n"),
    };
  }

  function resetErrorDemo(): void {
    errorDemo = { kind: "idle" };
    errorDemoTitle = "";
  }

  type BoardTask = {
    key: string;
    title: string;
    status: WorkflowStatus;
    meta: string;
    assignee: string;
    labels: Array<{ name: string; tone: "accent" | "success" | "warning" | "neutral" }>;
    href: string;
  };

  type BoardColumn = {
    id: string;
    title: string;
    status: WorkflowStatus;
    tasks: BoardTask[];
  };

  /** Active trace id for the board: the DESIGN.md §4.10 trace spine identity. */
  const traceId = "tr_8f29a4c1b3e0d5f7";

  let activeCreateColumnId = $state<string | null>(null);
  let createDraftTitle = $state("");
  let createDraftTouched = $state(false);
  /** When true the board renders its empty-state branch (`states: empty`). */
  let showEmptyState = $state(false);

  function openInlineCreate(columnId: string): void {
    activeCreateColumnId = columnId;
    createDraftTitle = "";
    createDraftTouched = false;
  }

  function cancelInlineCreate(): void {
    activeCreateColumnId = null;
    createDraftTitle = "";
    createDraftTouched = false;
  }

  function handleCreateKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineCreate();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      submitInlineCreate();
    }
  }

  function submitInlineCreate(): void {
    createDraftTouched = true;
    if (createDraftTitle.trim().length === 0) return;
    const columnId = activeCreateColumnId;
    if (!columnId) return;
    persistOptimisticTask(nextOptimisticId(), { columnId, title: createDraftTitle.trim() });
    activeCreateColumnId = null;
    createDraftTitle = "";
    createDraftTouched = false;
  }

  const columns: BoardColumn[] = [
    {
      id: "queued",
      title: "Queued",
      status: "queued",
      tasks: [
        {
          key: "AUTH-42",
          title: "Add kid and rotate flag to signToken",
          status: "queued",
          meta: "~25m · src/auth/session.ts",
          assignee: "co",
          labels: [{ name: "auth", tone: "accent" }],
          href: "/tasks/AUTH-42",
        },
        {
          key: "AUTH-46",
          title: "Migration: sessions table and kid index",
          status: "queued",
          meta: "~15m · db/migrations",
          assignee: "so",
          labels: [
            { name: "auth", tone: "accent" },
            { name: "db", tone: "success" },
          ],
          href: "/tasks/AUTH-46",
        },
        {
          key: "AUTH-48",
          title: "Telemetry events and dashboard tile",
          status: "queued",
          meta: "~25m · telemetry/",
          assignee: "ge",
          labels: [
            { name: "auth", tone: "accent" },
            { name: "telemetry", tone: "warning" },
          ],
          href: "/tasks/AUTH-48",
        },
      ],
    },
    {
      id: "running",
      title: "Running",
      status: "running",
      tasks: [
        {
          key: "AUTH-43",
          title: "Persist issuance row per kid (ip, ua, ts)",
          status: "running",
          meta: "3m · 2 files · run_8f29a4c",
          assignee: "co",
          labels: [
            { name: "auth", tone: "accent" },
            { name: "db", tone: "success" },
          ],
          href: "/tasks/AUTH-43",
        },
        {
          key: "AUTH-47",
          title: "Rate limiter: bucket per kid",
          status: "running",
          meta: "1m · src/limit/",
          assignee: "co",
          labels: [{ name: "auth", tone: "accent" }],
          href: "/tasks/AUTH-47",
        },
      ],
    },
    {
      id: "waiting-input",
      title: "Waiting input",
      status: "waiting-input",
      tasks: [
        {
          key: "AUTH-44",
          title: "verifyToken: lookup kid and dual-verify legacy",
          status: "waiting-input",
          meta: "blocked on AUTH-43",
          assignee: "co",
          labels: [{ name: "auth", tone: "accent" }],
          href: "/tasks/AUTH-44",
        },
      ],
    },
    {
      id: "blocked",
      title: "Blocked",
      status: "blocked",
      tasks: [
        {
          key: "AUTH-49",
          title: "Settings UI: active sessions list",
          status: "blocked",
          meta: "waiting on design lock",
          assignee: "so",
          labels: [
            { name: "auth", tone: "accent" },
            { name: "ui", tone: "neutral" },
          ],
          href: "/tasks/AUTH-49",
        },
      ],
    },
    {
      id: "completed",
      title: "Completed",
      status: "completed",
      tasks: [
        {
          key: "AUTH-45",
          title: "DELETE /sessions/:kid endpoint",
          status: "completed",
          meta: "merged 12m ago",
          assignee: "ge",
          labels: [{ name: "auth", tone: "accent" }],
          href: "/tasks/AUTH-45",
        },
      ],
    },
  ];

  /**
   * The five Build layouts (`IA-MAP.md §2.3` / OD `build-board.html` switcher).
   * Board / List / Timeline / Graph each have a production route. Calendar is
   * deferred to its own PRD (`design-alignment/build.md`: no OD file yet); it
   * stays in the switcher as a disabled affordance so the layout set is visible
   * without exposing a 404.
   */
  const layouts = [
    { id: "board", label: "Board", glyph: "▦", href: "/build-board" },
    { id: "list", label: "List", glyph: "☰", href: "/build-list" },
    { id: "timeline", label: "Timeline", glyph: "◰", href: "/build-timeline" },
    { id: "calendar", label: "Calendar", glyph: "◯", href: null },
    { id: "graph", label: "Graph", glyph: "◇", href: "/build-graph" },
  ] as const;

  const activeFilters = ["cycle:24w13", "module:auth"];
  const availableFilters = ["label:db", "label:telemetry", "@mine", "agent:any"];

  const totalTasks = columns.reduce((sum, column) => sum + column.tasks.length, 0);
</script>

<svelte:head>
  <title>Build board</title>
</svelte:head>

<section
  data-build-board
  data-state={showEmptyState ? "empty" : "populated"}
  class={cn("flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden")}
>
  <header data-build-board-header class={cn("flex flex-col gap-2 border-b border-border bg-card px-4 py-2")}>
    <div class={cn("flex flex-wrap items-center gap-2")}>
      <nav
        data-build-board-layouts
        role="tablist"
        aria-label="Build layouts"
        class={cn("inline-flex flex-wrap items-center gap-px rounded-md border border-border bg-muted/40 p-0.5")}
      >
        {#each layouts as layout}
          {#if layout.href}
            <a
              href={layout.href}
              role="tab"
              aria-current={layout.id === "board" ? "page" : undefined}
              aria-selected={layout.id === "board"}
              data-build-layout={layout.id}
              class={cn(
                "inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                layout.id === "board" && "bg-card text-foreground",
              )}
            >
              <span aria-hidden="true">{layout.glyph}</span>
              {layout.label}
            </a>
          {:else}
            <span
              role="tab"
              aria-selected="false"
              aria-disabled="true"
              data-build-layout={layout.id}
              data-build-layout-deferred="true"
              title="Calendar layout: coming soon"
              class={cn("inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs font-medium text-muted-foreground/50")}
            >
              <span aria-hidden="true">{layout.glyph}</span>
              {layout.label}
            </span>
          {/if}
        {/each}
      </nav>
      <span class={cn("flex-1")}></span>
      <Button size="sm" variant="ghost" data-build-board-group>Group: Status</Button>
      <Button size="sm" variant="ghost" data-build-board-sort>Sort: Manual</Button>
      <Button size="sm" variant="ghost" data-build-board-properties>Properties</Button>
      <Button size="sm" variant="secondary" data-build-board-filter>+ Filter</Button>
      <Button
        size="sm"
        data-build-board-new-task
        onclick={() => openInlineCreate("queued")}
      >+ New task <Kbd>c</Kbd></Button>
    </div>
  </header>

  <div data-build-board-filters class={cn("flex items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/30 px-4 py-1.5 text-xs")}>
    {#each activeFilters as filter}
      <Chip tone="accent" removable data-build-filter-active>{filter}</Chip>
    {/each}
    {#each availableFilters as filter}
      <Chip data-build-filter>{filter}</Chip>
    {/each}
    <Chip data-build-filter-add>+ add</Chip>
    <span class={cn("min-w-4 flex-1")}></span>
    <span data-build-board-summary class={cn("whitespace-nowrap text-muted-foreground")}>{totalTasks} tasks · 1 cycle · 1 module</span>
  </div>

  {#if showEmptyState}
    <div data-build-board-empty class={cn("flex flex-1 items-center justify-center bg-background px-4 py-10")}>
      <EmptyState
        title="No tasks in this cycle."
        description="The board groups tasks by status. Press c, or materialize an approved plan from Plan."
        keyHint="c"
      >
        {#snippet icon()}
          <span aria-hidden="true">▦</span>
        {/snippet}
        {#snippet actions()}
          <Button size="sm" data-build-board-empty-add onclick={() => { showEmptyState = false; openInlineCreate("queued"); }}>Add task</Button>
          <a href="/plan-review" data-build-board-empty-materialize class={cn("text-sm font-medium text-primary hover:underline")}>Materialize plan</a>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div data-build-board-scroll class={cn("grid flex-1 grid-flow-col auto-cols-[minmax(17rem,18rem)] items-start gap-3 overflow-auto bg-background p-3")}>
      {#each columns as column}
        <section data-build-column={column.id} class={cn("flex max-h-full min-h-[28rem] flex-col rounded-md border border-border bg-muted/35")}>
          <header data-build-column-header class={cn("flex items-center gap-2 border-b border-border px-2.5 py-2")}>
            <StatusBadge status={column.status} />
            <span data-build-column-count class={cn("rounded-full border border-border bg-card px-1.5 font-mono text-[10px] text-muted-foreground")}>{column.tasks.length}</span>
            <span class={cn("flex-1")}></span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Add task to ${column.title}`}
              data-build-column-add
              onclick={() => openInlineCreate(column.id)} class="size-8 px-0">+</Button>
          </header>

          <div class={cn("flex flex-col gap-2 overflow-y-auto p-2")}>
            {#each pendingFor(column.id) as entry (entry.id)}
              <article
                data-build-task-card
                data-build-task-optimistic={entry.id}
                data-pending={entry.status === "pending" ? "true" : undefined}
                data-failed={entry.status === "failed" ? "true" : undefined}
                class={cn(
                  "rounded-md border border-dashed border-border p-2.5",
                  entry.status === "pending" && "bg-card/40 text-muted-foreground",
                  entry.status === "failed" && "border-destructive bg-destructive/5",
                )}
              >
                <h2 class={cn("text-sm font-medium leading-5")}>{entry.value.title}</h2>
                {#if entry.status === "pending"}
                  <p class={cn("mt-2 text-[11px] text-muted-foreground")}>Saving…</p>
                {:else if entry.status === "failed"}
                  {@const rollback = rollbackFor(entry.id)}
                  <div
                    data-build-task-error
                    data-build-task-error-attempts={rollback?.attempts ?? 0}
                    data-build-task-error-escalated={rollback?.escalated ? "true" : undefined}
                    class={cn("mt-2 space-y-1 text-xs text-destructive")}
                  >
                    <p>{entry.error}</p>
                    {#if entry.traceId}
                      <p class={cn("font-mono text-[10px] text-muted-foreground")}>
                        trace
                        <span data-build-task-error-trace>{entry.traceId}</span>
                      </p>
                    {/if}
                    {#if rollback?.escalated}
                      <details data-build-task-error-payload class={cn("rounded-md border border-destructive/30 bg-destructive/5 p-2 text-foreground")}>
                        <summary class={cn("cursor-pointer text-[11px] font-medium text-destructive")}>
                          Last request payload (attempt {rollback.attempts})
                        </summary>
                        <pre class={cn("mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground")}><code>{JSON.stringify(rollback.lastPayload, null, 2)}</code></pre>
                      </details>
                      <ul data-build-task-error-actions class={cn("flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground")}>
                        {#each ROLLBACK_TROUBLESHOOTING.actions as action}
                          <li class={cn("rounded-md border border-border bg-background px-2 py-0.5")}>{action}</li>
                        {/each}
                      </ul>
                      <a
                        href={ROLLBACK_TROUBLESHOOTING.href}
                        data-build-task-error-troubleshooting
                        class={cn("inline-flex items-center text-[11px] font-medium text-accent underline-offset-2 hover:underline")}
                      >{ROLLBACK_TROUBLESHOOTING.label}</a>
                    {/if}
                    <div class={cn("flex items-center gap-2 pt-1")}>
                      <Button
                        size="sm"
                        variant="secondary"
                        data-build-task-retry
                        onclick={() => retryOptimisticTask(entry.id)}
                      >Retry</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-build-task-undo
                        onclick={() => undoOptimisticTask(entry.id)}
                      >Undo</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-build-task-dismiss
                        onclick={() => dismissOptimisticTask(entry.id)}
                      >Dismiss</Button>
                    </div>
                  </div>
                {/if}
              </article>
            {/each}
            {#each column.tasks as task}
              {@const modeScope = { stepId: task.key, kind: "task-card" as const, traceId, title: task.title }}
              <article
                data-build-task-card
                data-task-key={task.key}
                {...modeAffordanceHooks(modeScope)}
                aria-keyshortcuts="M K"
                class={cn("rounded-md border border-border bg-card p-2.5 shadow-xs transition-colors hover:border-border-strong")}
              >
                <div class={cn("mb-1.5 flex items-center gap-2")}>
                  <StatusBadge status={task.status} />
                  <span class={cn("flex-1")}></span>
                  <a href={task.href} class={cn("font-mono text-[10px] text-muted-foreground hover:underline")}>{task.key}</a>
                </div>
                <h2 class={cn("text-sm font-medium leading-snug text-foreground")}>{task.title}</h2>
                <p class={cn("mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground")}>
                  <span data-build-task-assignee class={cn("inline-flex size-[18px] items-center justify-center rounded-full border border-card bg-accent/10 text-[9px] font-semibold text-accent")}>{task.assignee}</span>
                  <span>{task.meta}</span>
                </p>
                <div class={cn("mt-2 flex flex-wrap items-center gap-1.5")}>
                  <div data-build-task-labels class={cn("flex flex-wrap gap-1")}>
                    {#each task.labels as label}
                      <Badge variant={label.tone === "neutral" ? "outline" : label.tone} size="sm">{label.name}</Badge>
                    {/each}
                  </div>
                  <span class={cn("flex-1")}></span>
                  <ModeRow {...createStepModeRow(modeScope)} value={task.status === "running" ? "play" : "manual"} />
                </div>
              </article>
            {/each}
            {#if activeCreateColumnId === column.id}
              <div
                data-build-board-new-task-row
                data-build-board-new-task-column={column.id}
                class={cn("rounded-md border border-border bg-card p-2.5 shadow-xs")}
              >
                <label class={cn("block space-y-1 text-xs font-medium uppercase tracking-wide text-muted-foreground")}>
                  <span>New task title</span>
                  <Input
                    data-build-board-new-task-input
                    autofocus
                    aria-invalid={createDraftTouched && createDraftTitle.trim().length === 0 ? "true" : undefined}
                    placeholder="Task title"
                    bind:value={createDraftTitle}
                    onkeydown={handleCreateKeydown}
                    oninput={() => { createDraftTouched = true; }}
                  />
                </label>
                {#if createDraftTouched && createDraftTitle.trim().length === 0}
                  <p data-build-board-new-task-error class={cn("mt-1 text-xs text-destructive")}>Title is required.</p>
                {/if}
                <p class={cn("mt-2 text-[11px] text-muted-foreground")}>
                  <Kbd>Enter</Kbd> save · <Kbd>Esc</Kbd> cancel
                </p>
              </div>
            {:else}
              <button
                type="button"
                data-build-board-new-task-trigger
                data-build-board-new-task-column={column.id}
                class={cn(
                  "flex items-center gap-2 rounded-md border border-dashed border-border bg-transparent p-2 text-left text-xs text-muted-foreground hover:border-border-strong hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
                onclick={() => openInlineCreate(column.id)}
              >
                <span>+ New task</span>
              </button>
            {/if}
          </div>
        </section>
      {/each}
    </div>
  {/if}

  <section
    data-build-board-error-states
    class={cn("flex flex-col gap-3 border-t border-border bg-muted/30 p-4")}
  >
    <header class={cn("flex flex-wrap items-center gap-3")}>
      <h2 class={cn("text-sm font-semibold")}>Error states</h2>
      <p class={cn("flex-1 text-xs text-muted-foreground")}>
        Errors render inline at the surface that triggered them: never as toasts.
      </p>
      <Button size="sm" variant="secondary" data-build-board-empty-toggle onclick={() => { showEmptyState = !showEmptyState; }}>
        {showEmptyState ? "Show populated board" : "Show empty board"}
      </Button>
      <Button size="sm" variant="secondary" data-build-error-trigger-validation onclick={triggerValidationError}>Trigger 400</Button>
      <Button size="sm" variant="secondary" data-build-error-trigger-network onclick={triggerNetworkError}>Trigger 500</Button>
      <Button size="sm" variant="secondary" data-build-error-trigger-unexpected onclick={triggerUnexpectedError}>Trigger unexpected</Button>
      <Button size="sm" variant="ghost" data-build-error-reset onclick={resetErrorDemo}>Reset</Button>
    </header>

    <form
      data-build-error-form
      class={cn("space-y-2 rounded-md border border-border bg-card p-3")}
      onsubmit={(event) => { event.preventDefault(); }}
    >
      <label class={cn("block space-y-1 text-xs font-medium uppercase tracking-wide text-muted-foreground")}>
        <span>Task title</span>
        <Input
          data-build-error-title-input
          aria-invalid={errorDemo.kind === "validation" ? "true" : undefined}
          bind:value={errorDemoTitle}
          placeholder="Enter a task title"
        />
      </label>
      {#if errorDemo.kind === "validation"}
        <FieldError data-build-error-field-error>
          {errorDemo.field}: {errorDemo.reason}
        </FieldError>
      {/if}
    </form>

    {#if errorDemo.kind === "network"}
      <ErrorBanner
        data-build-error-network
        surface={errorDemo.surface}
        title="Could not save the task"
        message={errorDemo.message}
        traceId={errorDemo.traceId}
        onRetry={triggerNetworkError}
      />
    {/if}

    {#if errorDemo.kind === "unexpected"}
      <ErrorBanner
        data-build-error-unexpected
        surface="block"
        title="Unexpected error while saving the task"
        message={errorDemo.message}
        traceId={errorDemo.traceId}
        viewDetailsLabel="View details"
        details={errorDemoDetails}
      />
    {/if}
  </section>
</section>

{#snippet errorDemoDetails()}
  {#if errorDemo.kind === "unexpected"}
    <pre data-build-error-details class={cn("overflow-x-auto whitespace-pre-wrap font-mono text-[10px] text-muted-foreground")}><code>{errorDemo.stack}</code></pre>
  {/if}
{/snippet}
