<script lang="ts">
  import { cn } from "$lib/utils.js";

  type DocType = "decision" | "runbook" | "note" | "spec";
  type DependencyStatus = "done" | "running" | "blocked" | "waiting";
  type RunState = "ready" | "running" | "cancelled";

  interface DocSearchResult {
    id: string;
    title: string;
    snippet: string;
    scope: string;
    project: string;
    task: string;
    run: string;
    docType: DocType;
    owner: string;
    updatedAt: string;
    hasAttachment: boolean;
    graphCounts: {
      backlinks: number;
      tasks: number;
      runs: number;
    };
  }

  interface DependencyTask {
    id: string;
    order: number;
    title: string;
    owner: string;
    status: DependencyStatus;
    dependencies: string[];
    blocker: string;
    feedback: string;
  }

  const RESULTS: DocSearchResult[] = [
    {
      id: "doc-kernel-notes",
      title: "Kernel search notes",
      snippet: "Search ranks title matches first, then snippet text. Planning context keeps selected doc references deterministic.",
      scope: "Project docs",
      project: "fulcrum",
      task: "task-search-17",
      run: "run-docs-004",
      docType: "decision",
      owner: "mkh",
      updatedAt: "2026-05-18 06:40",
      hasAttachment: true,
      graphCounts: { backlinks: 9, tasks: 3, runs: 2 },
    },
    {
      id: "doc-filter-map",
      title: "Filter map",
      snippet: "Project, task, run, document type, owner, and attachment filters narrow search before titles can leak.",
      scope: "Current task",
      project: "fulcrum",
      task: "task-search-17",
      run: "run-docs-002",
      docType: "runbook",
      owner: "ada",
      updatedAt: "2026-05-17 23:10",
      hasAttachment: false,
      graphCounts: { backlinks: 4, tasks: 1, runs: 1 },
    },
    {
      id: "doc-graph-actions",
      title: "Graph actions",
      snippet: "Results can open, copy a link, reveal the node in the document tree, or become planning context.",
      scope: "Workspace docs",
      project: "fulcrum",
      task: "task-plan-09",
      run: "run-docs-001",
      docType: "note",
      owner: "codex",
      updatedAt: "2026-05-16 19:25",
      hasAttachment: true,
      graphCounts: { backlinks: 6, tasks: 2, runs: 4 },
    },
  ];

  const FILTERS = {
    project: ["fulcrum", "platform"],
    task: ["task-search-17", "task-plan-09"],
    run: ["run-docs-004", "run-docs-002"],
    docType: ["decision", "runbook", "note", "spec"],
    owner: ["mkh", "ada", "codex"],
    attachments: ["with attachments", "without attachments"],
  };

  const DEPENDENCY_TASKS: DependencyTask[] = [
    {
      id: "task-discovery",
      order: 1,
      title: "Confirm source refs",
      owner: "research",
      status: "done",
      dependencies: [],
      blocker: "",
      feedback: "3 source refs pinned to planning context",
    },
    {
      id: "task-plan",
      order: 2,
      title: "Materialize task breakdown",
      owner: "pm",
      status: "running",
      dependencies: ["task-discovery"],
      blocker: "",
      feedback: "6 subtasks generated from accepted scope",
    },
    {
      id: "task-build",
      order: 3,
      title: "Dispatch implementation run",
      owner: "agent-runner",
      status: "blocked",
      dependencies: ["task-plan", "doc-kernel-notes"],
      blocker: "Waiting for approval on risky write action",
      feedback: "Run paused before filesystem mutation",
    },
    {
      id: "task-verify",
      order: 4,
      title: "Verify and report",
      owner: "qa",
      status: "waiting",
      dependencies: ["task-build"],
      blocker: "Dependency run has not completed",
      feedback: "No verification feedback yet",
    },
  ];

  const STATUS_COPY: Record<DependencyStatus, string> = {
    done: "done",
    running: "running",
    blocked: "blocked",
    waiting: "waiting",
  };

  let selectedProject = $state("fulcrum");
  let selectedTask = $state("");
  let selectedRun = $state("");
  let selectedDocType = $state("");
  let selectedOwner = $state("");
  let selectedAttachment = $state("");
  let planningContext = $state<string[]>([]);
  let copiedLink = $state("");
  let revealedTreeNode = $state("");
  let runState = $state<RunState>("ready");
  let dependencyTasks = $state<DependencyTask[]>(DEPENDENCY_TASKS);
  let runFeedback = $state([
    "Run state loaded from dependency execution API snapshot",
    "Blocked node task-build explains approval gate before write",
  ]);

  const blockedTasks = $derived(dependencyTasks.filter((task) => task.blocker));
  const activeTask = $derived(dependencyTasks.find((task) => task.status === "running") ?? dependencyTasks[0]);

  const filteredResults = $derived.by(() => RESULTS.filter((result) =>
    (!selectedProject || result.project === selectedProject)
    && (!selectedTask || result.task === selectedTask)
    && (!selectedRun || result.run === selectedRun)
    && (!selectedDocType || result.docType === selectedDocType)
    && (!selectedOwner || result.owner === selectedOwner)
    && (!selectedAttachment || (selectedAttachment === "with attachments" ? result.hasAttachment : !result.hasAttachment))
  ));

  function addToPlanningContext(result: DocSearchResult): void {
    if (!planningContext.includes(result.id)) planningContext = [...planningContext, result.id];
  }

  function copyLink(result: DocSearchResult): void {
    copiedLink = `/docs/${result.id}`;
  }

  function revealInTree(result: DocSearchResult): void {
    revealedTreeNode = result.id;
  }

  function resetFilters(): void {
    selectedProject = "fulcrum";
    selectedTask = "";
    selectedRun = "";
    selectedDocType = "";
    selectedOwner = "";
    selectedAttachment = "";
  }

  function dispatchDependencyRun(): void {
    runState = "running";
    dependencyTasks = dependencyTasks.map((task) => task.id === "task-build"
      ? { ...task, status: "running", blocker: "", feedback: "Dependency run dispatched after approval" }
      : task);
    runFeedback = ["dispatch accepted: run-dependency-042", ...runFeedback];
  }

  function retryBlockedRun(): void {
    runState = "running";
    dependencyTasks = dependencyTasks.map((task) => task.status === "blocked"
      ? { ...task, status: "running", blocker: "", feedback: "Retry queued with original dependency order" }
      : task);
    runFeedback = ["retry queued for blocked dependency node", ...runFeedback];
  }

  function cancelDependencyRun(): void {
    runState = "cancelled";
    runFeedback = ["cancel requested: downstream waiting nodes held", ...runFeedback];
  }
</script>

<svelte:head>
  <title>Build graph</title>
</svelte:head>

<main data-build-graph-search class={cn("min-h-screen overflow-x-hidden bg-background text-foreground")}>
  <div class={cn("mx-auto flex max-w-7xl min-w-0 flex-col gap-4 px-4 py-5 lg:px-6")}>
    <header data-build-graph-header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Build graph</p>
        <h1 class={cn("text-2xl font-semibold tracking-normal")}>Task dependency execution</h1>
        <p class={cn("mt-1 max-w-2xl text-sm text-muted-foreground")}>
          Inspect execution order, run state, blockers, feedback, and source refs before dispatch.
        </p>
      </div>
      <div data-permission-copy class={cn("rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground")}>
        Permissions filter before results render. Unauthorized titles stay hidden.
      </div>
    </header>

    <section data-dependency-panel class={cn("grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]")}>
      <div class={cn("min-w-0 rounded-md border border-border bg-card")}>
        <div class={cn("flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2")}>
          <div>
            <h2 class={cn("text-sm font-semibold")}>Dependency order</h2>
            <p class={cn("mt-0.5 text-xs text-muted-foreground")}>Current active node: {activeTask.title}</p>
          </div>
          <span data-run-state class={cn("rounded-sm border border-border bg-muted px-2 py-1 text-xs font-medium")}>run:{runState}</span>
        </div>

        <div class={cn("grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4")}>
          {#each dependencyTasks as task (task.id)}
            <article data-dependency-node data-task-id={task.id} class={cn("min-w-0 rounded-sm border border-border bg-background p-3")}>
              <div class={cn("flex items-start justify-between gap-2")}>
                <span data-dependency-order class={cn("grid size-7 shrink-0 place-items-center rounded-sm bg-muted text-xs font-semibold")}>{task.order}</span>
                <span data-node-status class={cn(
                  "rounded-sm border px-1.5 py-0.5 text-xs",
                  task.status === "done" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                  task.status === "running" && "border-sky-500/40 text-sky-700 dark:text-sky-300",
                  task.status === "blocked" && "border-destructive/50 text-destructive",
                  task.status === "waiting" && "border-border text-muted-foreground",
                )}>{STATUS_COPY[task.status]}</span>
              </div>
              <h3 class={cn("mt-3 text-sm font-semibold leading-tight")}>{task.title}</h3>
              <p class={cn("mt-1 text-xs text-muted-foreground")}>owner:{task.owner}</p>
              <div data-dependency-edges class={cn("mt-3 flex flex-wrap gap-1")}>
                {#if task.dependencies.length === 0}
                  <span class={cn("rounded-xs bg-muted px-1.5 py-0.5 text-xs text-muted-foreground")}>root</span>
                {:else}
                  {#each task.dependencies as dependency}
                    <span data-dependency-chip class={cn("max-w-full break-all rounded-xs bg-muted px-1.5 py-0.5 text-xs text-muted-foreground")}>{dependency}</span>
                  {/each}
                {/if}
              </div>
              <p data-node-feedback class={cn("mt-3 text-xs text-muted-foreground")}>{task.feedback}</p>
              {#if task.blocker}
                <p data-blocker-row class={cn("mt-2 rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive")}>{task.blocker}</p>
              {/if}
            </article>
          {/each}
        </div>
      </div>

      <aside data-run-feedback-panel class={cn("space-y-3 rounded-md border border-border bg-card p-3")}>
        <div>
          <h2 class={cn("text-sm font-semibold")}>Execution feedback</h2>
          <p class={cn("mt-1 text-xs text-muted-foreground")}>{blockedTasks.length} blockers visible before dispatch.</p>
        </div>
        <div data-run-actions class={cn("grid gap-2 sm:grid-cols-3")}>
          <button data-action-dispatch type="button" onclick={dispatchDependencyRun} class={cn("min-w-0 rounded-sm border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted")}>Dispatch</button>
          <button data-action-retry type="button" onclick={retryBlockedRun} class={cn("min-w-0 rounded-sm border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted")}>Retry</button>
          <button data-action-cancel type="button" onclick={cancelDependencyRun} class={cn("min-w-0 rounded-sm border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted")}>Cancel</button>
        </div>
        <div class={cn("space-y-2")}>
          {#each runFeedback as feedback}
            <p data-feedback-row class={cn("rounded-sm bg-muted px-2 py-1.5 text-xs text-muted-foreground")}>{feedback}</p>
          {/each}
        </div>
      </aside>
    </section>

    <section data-search-toolbar class={cn("grid gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(280px,1fr)_auto]")}>
      <label class={cn("text-sm font-medium")}>
        Search
        <input
          data-doc-search-input
          class={cn("mt-1 h-9 w-full rounded-sm border border-input bg-background px-3 text-sm")}
          type="search"
          value="kernel"
          aria-label="Search docs"
        />
      </label>
      <div data-ranking-explanation class={cn("self-end rounded-sm bg-muted px-3 py-2 text-xs text-muted-foreground")}>
        Ranking: title match, snippet match, backlink count, updated time.
      </div>
    </section>

    <div class={cn("grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]")}>
      <aside data-doc-search-filters class={cn("space-y-3 rounded-md border border-border bg-card p-3")}>
        <div class={cn("flex items-center justify-between")}>
          <h2 class={cn("text-sm font-semibold")}>Filters</h2>
          <button data-reset-filters type="button" onclick={resetFilters} class={cn("text-xs text-muted-foreground underline-offset-2 hover:underline")}>Reset</button>
        </div>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Project
          <select data-filter-project bind:value={selectedProject} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            {#each FILTERS.project as item}
              <option value={item}>{item}</option>
            {/each}
          </select>
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Task
          <select data-filter-task bind:value={selectedTask} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any task</option>
            {#each FILTERS.task as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Run
          <select data-filter-run bind:value={selectedRun} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any run</option>
            {#each FILTERS.run as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Document type
          <select data-filter-doc-type bind:value={selectedDocType} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any type</option>
            {#each FILTERS.docType as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Owner
          <select data-filter-owner bind:value={selectedOwner} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any owner</option>
            {#each FILTERS.owner as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Attachments
          <select data-filter-attachments bind:value={selectedAttachment} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any attachment state</option>
            {#each FILTERS.attachments as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>
      </aside>

      <section data-doc-search-results class={cn("min-w-0 rounded-md border border-border bg-card")}>
        <div class={cn("flex items-center justify-between border-b border-border px-3 py-2")}>
          <h2 class={cn("text-sm font-semibold")}>Results</h2>
          <span data-result-count class={cn("text-xs text-muted-foreground")}>{filteredResults.length} visible</span>
        </div>

        <div class={cn("divide-y divide-border")}>
          {#each filteredResults as result (result.id)}
            <article data-doc-result data-doc-id={result.id} class={cn("p-3")}>
              <div class={cn("flex flex-wrap items-center gap-2")}>
                <h3 class={cn("text-md font-semibold")}>{result.title}</h3>
                <span data-doc-type class={cn("rounded-xs border border-border px-1.5 py-0.5 text-xs text-muted-foreground")}>{result.docType}</span>
                <span data-doc-scope class={cn("rounded-xs bg-muted px-1.5 py-0.5 text-xs text-muted-foreground")}>{result.scope}</span>
              </div>
              <p data-doc-snippet class={cn("mt-2 text-sm text-muted-foreground")}>
                <mark class={cn("bg-accent/20 text-foreground")}>Search</mark>{result.snippet.slice("Search".length)}
              </p>
              <div class={cn("mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground")}>
                <span data-updated-at>{result.updatedAt}</span>
                <span data-owner>owner:{result.owner}</span>
                <span data-graph-counts>{result.graphCounts.backlinks} backlinks, {result.graphCounts.tasks} tasks, {result.graphCounts.runs} runs</span>
                <span data-attachment-state>{result.hasAttachment ? "attachment" : "no attachment"}</span>
              </div>
              <div data-result-actions class={cn("mt-3 flex flex-wrap gap-2")}>
                <a data-action-open href={`/docs/${result.id}`} class={cn("rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted")}>Open</a>
                <button data-action-context type="button" onclick={() => addToPlanningContext(result)} class={cn("rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted")}>Add to planning context</button>
                <button data-action-copy type="button" onclick={() => copyLink(result)} class={cn("rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted")}>Copy link</button>
                <button data-action-reveal type="button" onclick={() => revealInTree(result)} class={cn("rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted")}>Reveal in tree</button>
              </div>
            </article>
          {/each}
        </div>
      </section>

      <aside data-planning-context class={cn("space-y-3 rounded-md border border-border bg-card p-3")}>
        <div>
          <h2 class={cn("text-sm font-semibold")}>Planning context</h2>
          <p class={cn("mt-1 text-xs text-muted-foreground")}>Selected source refs stay deterministic for the next planning session.</p>
        </div>
        <div data-selected-context class={cn("space-y-1 text-sm")}>
          {#if planningContext.length === 0}
            <p class={cn("text-muted-foreground")}>No docs selected.</p>
          {:else}
            {#each planningContext as id}
              <div data-context-ref class={cn("rounded-sm bg-muted px-2 py-1 font-mono text-xs")}>{id}</div>
            {/each}
          {/if}
        </div>
        <div data-tree-reveal class={cn("rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground")}>
          Tree reveal: {revealedTreeNode || "none"}
        </div>
        <div data-copied-link class={cn("rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground")}>
          Copied link: {copiedLink || "none"}
        </div>
      </aside>
    </div>
  </div>
</main>
