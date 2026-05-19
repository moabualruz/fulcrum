<script lang="ts">
  import { Badge, Button, Chip, EmptyState, Kbd, ModeRow, StatusBadge } from "@fulcrum/ui-kit";
  import type { WorkflowStatus } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  type BoardTask = {
    key: string;
    title: string;
    status: WorkflowStatus;
    estimate: string;
    source: string;
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
          estimate: "25m",
          source: "src/auth/session.ts",
          assignee: "co",
          labels: [{ name: "auth", tone: "accent" }],
          href: "/tasks/AUTH-42",
        },
        {
          key: "AUTH-46",
          title: "Migration: sessions table and kid index",
          status: "queued",
          estimate: "15m",
          source: "db/migrations",
          assignee: "so",
          labels: [
            { name: "auth", tone: "accent" },
            { name: "db", tone: "success" },
          ],
          href: "/tasks/AUTH-46",
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
          title: "Persist issuance row per kid",
          status: "running",
          estimate: "3m",
          source: "run_8f29a4c",
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
          estimate: "1m",
          source: "src/limit",
          assignee: "co",
          labels: [{ name: "auth", tone: "accent" }],
          href: "/tasks/AUTH-47",
        },
      ],
    },
    {
      id: "blocked",
      title: "Blocked",
      status: "blocked",
      tasks: [
        {
          key: "AUTH-51",
          title: "Verify risky write approval before rollout",
          status: "blocked",
          estimate: "waiting",
          source: "approval queue",
          assignee: "qa",
          labels: [
            { name: "review", tone: "warning" },
            { name: "auth", tone: "accent" },
          ],
          href: "/tasks/AUTH-51",
        },
      ],
    },
    {
      id: "completed",
      title: "Completed",
      status: "completed",
      tasks: [
        {
          key: "AUTH-39",
          title: "Expose trace links from session events",
          status: "completed",
          estimate: "done",
          source: "trace_4f3a1c9e",
          assignee: "ge",
          labels: [{ name: "telemetry", tone: "neutral" }],
          href: "/tasks/AUTH-39",
        },
      ],
    },
  ];

  const layoutLabels = ["Board", "List", "Timeline", "Calendar", "Graph"];
  const activeFilters = ["sprint:24w13", "module:auth"];
  const availableFilters = ["label:db", "label:telemetry", "@mine", "agent:any"];
</script>

<svelte:head>
  <title>Build board</title>
</svelte:head>

<section data-build-board class={cn("flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden")}>
  <header data-build-board-header class={cn("flex flex-col gap-3 border-b border-border bg-background px-4 py-3")}>
    <div class={cn("flex flex-wrap items-center gap-3")}>
      <div>
        <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Build</p>
        <h1 class={cn("text-h2 font-semibold")}>Authentication rewrite board</h1>
      </div>
      <span class={cn("flex-1")}></span>
      <Button size="sm" variant="outline" data-build-board-group>Group: Status</Button>
      <Button size="sm" variant="outline" data-build-board-sort>Sort: Manual</Button>
      <Button size="sm" variant="outline" data-build-board-properties>Properties</Button>
      <Button size="sm" data-build-board-new-task>New task <Kbd>c</Kbd></Button>
    </div>

    <nav data-build-board-layouts class={cn("flex flex-wrap items-center gap-1")} aria-label="Build layouts">
      {#each layoutLabels as label}
        <a
          href={label === "Board" ? "/build-board" : `/build-${label.toLowerCase()}`}
          aria-current={label === "Board" ? "page" : undefined}
          class={cn(
            "rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground",
            label === "Board" && "bg-card text-foreground",
          )}
          data-build-layout={label.toLowerCase()}
        >
          {label}
        </a>
      {/each}
    </nav>
  </header>

  <div data-build-board-filters class={cn("flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/30 px-4 py-2 text-xs")}>
    {#each activeFilters as filter}
      <Chip tone="accent" removable data-build-filter-active>{filter}</Chip>
    {/each}
    {#each availableFilters as filter}
      <Chip data-build-filter>{filter}</Chip>
    {/each}
    <span class={cn("min-w-4 flex-1")}></span>
    <span data-build-board-summary class={cn("whitespace-nowrap text-muted-foreground")}>6 tasks · 1 sprint · 1 module</span>
  </div>

  <div data-build-board-empty-reference class={cn("border-b border-border bg-background px-4 py-4")}>
    <EmptyState
      title="No tasks on the board"
      description="The board shows tasks grouped by status. Add a task or promote a capture to start."
    >
      {#snippet icon()}
        <span aria-hidden="true">▦</span>
      {/snippet}
      {#snippet action()}
        <a href="/projects/new" class={cn("text-sm font-medium text-primary hover:underline")}>New task</a>
      {/snippet}
    </EmptyState>
  </div>

  <div data-build-board-scroll class={cn("grid flex-1 grid-flow-col auto-cols-[minmax(17rem,19rem)] gap-3 overflow-auto bg-background p-4")}>
    {#each columns as column}
      <section data-build-column={column.id} class={cn("flex max-h-full min-h-[28rem] flex-col rounded-md border border-border bg-muted/35")}>
        <header data-build-column-header class={cn("flex items-center gap-2 border-b border-border px-3 py-2")}>
          <StatusBadge status={column.status} />
          <span data-build-column-count class={cn("rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground")}>{column.tasks.length}</span>
          <span class={cn("flex-1")}></span>
          <Button size="icon" variant="ghost" aria-label={`Add task to ${column.title}`} data-build-column-add>+</Button>
        </header>

        <div class={cn("flex flex-col gap-2 overflow-y-auto p-2")}>
          {#each column.tasks as task}
            <article
              data-build-task-card
              data-task-key={task.key}
              class={cn("rounded-md border border-border bg-card p-3 shadow-xs transition-colors hover:border-border-strong")}
            >
              <div class={cn("mb-2 flex items-center gap-2")}>
                <StatusBadge status={task.status} hideLabel />
                <span class={cn("flex-1")}></span>
                <a href={task.href} class={cn("font-mono text-[11px] text-muted-foreground hover:underline")}>{task.key}</a>
              </div>
              <h2 class={cn("text-sm font-medium leading-5")}>{task.title}</h2>
              <p class={cn("mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground")}>
                <span data-build-task-assignee class={cn("inline-flex size-5 items-center justify-center rounded-full border border-border bg-accent/10 text-[10px] font-semibold text-accent")}>{task.assignee}</span>
                <span>{task.estimate}</span>
                <span aria-hidden="true">·</span>
                <span>{task.source}</span>
              </p>
              <div class={cn("mt-3 flex flex-wrap items-center gap-2")}>
                {#each task.labels as label}
                  <Badge variant={label.tone === "neutral" ? "outline" : label.tone} size="sm">{label.name}</Badge>
                {/each}
                <span class={cn("flex-1")}></span>
                <ModeRow modes={["play", "discuss", "ai-assist"]} value={task.status === "running" ? "play" : "ai-assist"} ariaLabel={`Modes for ${task.key}`} />
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</section>
