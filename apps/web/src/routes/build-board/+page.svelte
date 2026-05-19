<script lang="ts">
  import { Badge, Button, Chip, EmptyState, Input, Kbd, ModeRow, StatusBadge } from "@fulcrum/ui-kit";
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

  let activeCreateColumnId = $state<string | null>(null);
  let createDraftTitle = $state("");
  let createDraftTouched = $state(false);

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
    // Persist via tRPC tasks.create in a follow-up wiring slice; for the
    // design surface, clearing the draft confirms a successful save shape.
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
  const projectTemplates = [
    { name: "Agent workflow", detail: "Plan, build, review, and ship stages with AI Assist ready." },
    { name: "Repository maintenance", detail: "Issue intake, dependency graph, CI runs, and release checks." },
    { name: "Blank workflow", detail: "Start empty while keeping project, repo, and stage setup visible." },
  ];
  const setupActions = ["Open overview", "Open board", "Open settings"];
  const integrationCards = [
    { name: "Slack", state: "Connected", detail: "#build-alerts - issue.created, run.failed", action: "Refresh OAuth", tone: "success" },
    { name: "GitHub", state: "Needs review", detail: "acme/auth-service - pull_request, check_suite", action: "Review scopes", tone: "warning" },
    { name: "Jira", state: "Disconnected", detail: "Map Fulcrum tasks to Jira issues.", action: "Connect Jira", tone: "neutral" },
  ] as const;
  const webhookEvents = ["issue.created", "task.updated", "run.failed", "artifact.accepted"];
  const integrationLogs = [
    { time: "12:40:18", service: "webhook", status: "200", message: "issue.created delivered in 183 ms" },
    { time: "12:38:04", service: "github", status: "401", message: "token scope missing repo:status" },
    { time: "12:35:51", service: "slack", status: "200", message: "run.failed posted to #build-alerts" },
    { time: "12:30:12", service: "webhook", status: "500", message: "receiver timeout after 3 retries" },
  ];
  let webhookUrl = $state("https://hooks.fulcrum.local/w/auth-rewrite/whsec_****0f9a");
  let webhookVersion = $state(1);
  let webhookTestStatus = $state("Not tested");
  let oneTimeToken = $state("flcm_live_4y5c...shown-once");
  let tokenCopied = $state(false);
  let tokenRevoked = $state(false);

  function rotateWebhook() {
    webhookVersion += 1;
    webhookUrl = `https://hooks.fulcrum.local/w/auth-rewrite/whsec_****${String(webhookVersion).padStart(4, "0")}`;
    webhookTestStatus = "Rotated; dry-run required";
  }

  function testWebhook() {
    webhookTestStatus = "Dry-run sent: issue.created - 202 Accepted";
  }

  function copyToken() {
    tokenCopied = true;
    oneTimeToken = "Copied; hidden after first reveal";
  }

  function revokeToken() {
    tokenRevoked = true;
    tokenCopied = false;
    oneTimeToken = "Revoked instantly";
  }
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

  <section data-project-setup-flow class={cn("grid gap-4 border-b border-border bg-background px-4 py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]")}>
    <div class={cn("space-y-3")}>
      <div class={cn("flex flex-wrap items-start justify-between gap-3")}>
        <div>
          <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>New project path</p>
          <h2 class={cn("text-lg font-semibold")}>Create a workflow container</h2>
          <p class={cn("mt-1 max-w-2xl text-sm text-muted-foreground")}>
            Capture the project name, repository, and template before the first board opens.
          </p>
        </div>
        <Button size="sm" data-project-create-action>Create project</Button>
      </div>

      <div class={cn("grid gap-3 sm:grid-cols-2")}>
        <label class={cn("space-y-1 text-sm font-medium")} data-project-name-field>
          <span>Project name</span>
          <Input aria-invalid="true" value="" placeholder="Authentication rewrite" />
          <span data-project-validation class={cn("block text-xs text-destructive")}>Project name is required.</span>
        </label>
        <label class={cn("space-y-1 text-sm font-medium")} data-project-repo-field>
          <span>Repository</span>
          <Input value="github.com/acme/auth-service" placeholder="owner/repo or local path" />
          <span class={cn("block text-xs text-muted-foreground")}>Linked repo unlocks files, commits, runs, and dependency graph actions.</span>
        </label>
      </div>
    </div>

    <aside data-project-template-panel class={cn("rounded-md border border-border bg-muted/35 p-3")}>
      <div class={cn("mb-3 flex items-center gap-2")}>
        <StatusBadge status="running" />
        <span class={cn("text-sm font-semibold")}>Apply template</span>
      </div>
      <div class={cn("grid gap-2")}>
        {#each projectTemplates as template}
          <button
            type="button"
            data-project-template
            class={cn("rounded-md border border-border bg-background p-3 text-left text-sm hover:border-border-strong")}
          >
            <span class={cn("block font-medium")}>{template.name}</span>
            <span class={cn("mt-1 block text-xs text-muted-foreground")}>{template.detail}</span>
          </button>
        {/each}
      </div>
      <div data-project-next-actions class={cn("mt-3 flex flex-wrap gap-2")}>
        {#each setupActions as action}
          <a href="/projects/auth-rewrite" class={cn("rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground")}>{action}</a>
        {/each}
      </div>
    </aside>
  </section>

  <section data-workspace-integrations class={cn("grid min-w-0 gap-4 border-b border-border bg-background px-4 py-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)]")}>
    <div class={cn("min-w-0 space-y-3")}>
      <div class={cn("flex flex-wrap items-start justify-between gap-3")}>
        <div>
          <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Workspace settings</p>
          <h2 class={cn("text-lg font-semibold")}>Integrations and webhooks</h2>
          <p class={cn("mt-1 max-w-2xl text-sm text-muted-foreground")}>
            Connect services, dry-run payloads, rotate secrets, and audit the latest delivery calls.
          </p>
        </div>
        <Button size="sm" variant="outline" data-integration-audit-link>Open audit log</Button>
      </div>

      <div data-integration-oauth-grid class={cn("grid gap-2 md:grid-cols-3")}>
        {#each integrationCards as integration}
          <article data-integration-card={integration.name.toLowerCase()} class={cn("rounded-md border border-border bg-card p-3")}>
            <div class={cn("mb-2 flex items-start justify-between gap-2")}>
              <div>
                <h3 class={cn("text-sm font-semibold")}>{integration.name}</h3>
                <p class={cn("mt-1 text-xs text-muted-foreground")}>{integration.detail}</p>
              </div>
              <Badge variant={integration.tone === "neutral" ? "outline" : integration.tone} size="sm">{integration.state}</Badge>
            </div>
            <Button size="sm" variant="outline" data-integration-oauth-action={integration.name.toLowerCase()}>{integration.action}</Button>
          </article>
        {/each}
      </div>

      <div data-api-token-panel class={cn("rounded-md border border-border bg-muted/35 p-3")}>
        <div class={cn("flex flex-wrap items-center gap-2")}>
          <h3 class={cn("text-sm font-semibold")}>API token</h3>
          <Badge variant={tokenRevoked ? "destructive" : "success"} size="sm">{tokenRevoked ? "Revoked" : "Active"}</Badge>
          <span class={cn("flex-1")}></span>
          <Button size="sm" variant="outline" data-api-token-copy disabled={tokenRevoked} onclick={copyToken}>Copy once</Button>
          <Button size="sm" variant="destructive" data-api-token-revoke disabled={tokenRevoked} onclick={revokeToken}>Revoke now</Button>
        </div>
        <p data-api-token-value class={cn("mt-2 font-mono text-xs text-muted-foreground")}>{oneTimeToken}</p>
        {#if tokenCopied}
          <p data-api-token-copy-state class={cn("mt-2 text-xs text-muted-foreground")}>Copied to clipboard; secret will not appear in logs.</p>
        {/if}
      </div>
    </div>

    <aside data-webhook-panel class={cn("min-w-0 space-y-3 rounded-md border border-border bg-muted/35 p-3")}>
      <div class={cn("flex flex-wrap items-center gap-2")}>
        <h3 class={cn("text-sm font-semibold")}>Webhook endpoint</h3>
        <Badge variant="success" size="sm">Signing enabled</Badge>
        <span class={cn("flex-1")}></span>
        <Button size="sm" variant="outline" data-webhook-rotate onclick={rotateWebhook}>Rotate URL</Button>
        <Button size="sm" data-webhook-test onclick={testWebhook}>Send dry-run</Button>
      </div>
      <p data-webhook-url class={cn("break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs")}>{webhookUrl}</p>
      <div data-webhook-events class={cn("flex flex-wrap gap-2")}>
        {#each webhookEvents as event}
          <Chip tone="accent">{event}</Chip>
        {/each}
      </div>
      <p data-webhook-test-status class={cn("text-xs text-muted-foreground")}>{webhookTestStatus}</p>
      <div data-integration-log class={cn("min-w-0 overflow-x-auto")}>
        <table class={cn("w-full min-w-[34rem] text-xs")}>
          <caption class={cn("mb-2 text-left font-medium text-muted-foreground")}>Last 100 integration calls</caption>
          <thead>
            <tr class={cn("border-b border-border text-left")}>
              <th class={cn("py-1 pr-3 font-medium")}>Time</th>
              <th class={cn("py-1 pr-3 font-medium")}>Service</th>
              <th class={cn("py-1 pr-3 font-medium")}>Status</th>
              <th class={cn("py-1 font-medium")}>Result</th>
            </tr>
          </thead>
          <tbody>
            {#each integrationLogs as log}
              <tr data-integration-log-row class={cn("border-b border-border/50 last:border-0")}>
                <td class={cn("py-1 pr-3 font-mono")}>{log.time}</td>
                <td class={cn("py-1 pr-3")}>{log.service}</td>
                <td class={cn("py-1 pr-3 font-mono", log.status.startsWith("2") ? "text-green-700" : "text-destructive")}>{log.status}</td>
                <td class={cn("py-1")}>{log.message}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </aside>
  </section>

  <div data-build-board-empty-reference class={cn("border-b border-border bg-background px-4 py-4")}>
    <EmptyState
      title="No tasks on the board"
      description="The board shows tasks grouped by status. Add a task or promote a capture to start."
    >
      {#snippet icon()}
        <span aria-hidden="true">▦</span>
      {/snippet}
      {#snippet actions()}
        <a href="/projects/new" class={cn("text-sm font-medium text-primary hover:underline")}>Create project</a>
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
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Add task to ${column.title}`}
            data-build-column-add
            onclick={() => openInlineCreate(column.id)}
          >+</Button>
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
          {#if activeCreateColumnId === column.id}
            <div
              data-build-board-new-task-row
              data-build-board-new-task-column={column.id}
              class={cn("rounded-md border border-border bg-card p-3 shadow-xs")}
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
</section>
