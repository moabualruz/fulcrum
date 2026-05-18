<script lang="ts">
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";

  type DocType = "decision" | "runbook" | "note" | "spec";
  type DependencyStatus = "done" | "running" | "blocked" | "waiting";
  type ExportScope = "single" | "subtree";
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

  interface DocumentExportPackage {
    scope: ExportScope;
    label: string;
    manifestVersion: string;
    rootDoc: string;
    docs: string[];
    bodyFormat: string;
    frontmatterFields: string[];
    attachments: string[];
    linkMap: string[];
    traceRefs: string[];
    artifactTarget: string;
    metadataPolicy: string;
  }

  interface ImportConflict {
    id: string;
    incoming: string;
    existing: string;
    resolution: string;
  }

  interface ImportPreview {
    destination: string;
    conflicts: ImportConflict[];
    missingAttachments: string[];
    remappedLinks: string[];
    traceRefs: string[];
    sourceEvent: string;
    overwriteGuard: string;
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

  const EXPORT_PACKAGES: Record<ExportScope, DocumentExportPackage> = {
    single: {
      scope: "single",
      label: "Single document package",
      manifestVersion: "manifest:v1",
      rootDoc: "doc-kernel-notes",
      docs: ["doc-kernel-notes"],
      bodyFormat: "markdown body",
      frontmatterFields: ["title", "docType", "owner", "task", "run", "updatedAt"],
      attachments: ["kernel-search-proof.png"],
      linkMap: ["doc-kernel-notes -> task-search-17", "doc-kernel-notes -> run-docs-004"],
      traceRefs: ["trace-e2e-proof", "run-docs-004", "task-search-17"],
      artifactTarget: "review handoff artifact",
      metadataPolicy: "Internal-only metadata excluded by default",
    },
    subtree: {
      scope: "subtree",
      label: "Subtree package",
      manifestVersion: "manifest:v1",
      rootDoc: "doc-kernel-notes",
      docs: ["doc-kernel-notes", "doc-filter-map", "doc-graph-actions", "doc-runbook-index"],
      bodyFormat: "markdown body bundle",
      frontmatterFields: ["title", "docType", "owner", "task", "run", "updatedAt", "parentId"],
      attachments: ["kernel-search-proof.png", "graph-actions.json", "handoff-review.txt"],
      linkMap: [
        "doc-kernel-notes -> doc-filter-map",
        "doc-graph-actions -> doc-kernel-notes",
        "doc-runbook-index -> task-search-17",
      ],
      traceRefs: ["trace-e2e-proof", "run-docs-004", "task-search-17", "artifact-review-012"],
      artifactTarget: "review handoff artifact",
      metadataPolicy: "Internal-only metadata excluded by default",
    },
  };

  const IMPORT_PREVIEW: ImportPreview = {
    destination: "fulcrum / Project docs / Imported handoff",
    conflicts: [
      {
        id: "doc-kernel-notes",
        incoming: "Kernel search notes",
        existing: "Kernel search notes",
        resolution: "rename incoming to Kernel search notes imported",
      },
      {
        id: "doc-filter-map",
        incoming: "Filter map",
        existing: "Filter map draft",
        resolution: "keep target and import as sibling",
      },
    ],
    missingAttachments: ["handoff-review.txt missing - blocked until replacement mapped"],
    remappedLinks: [
      "doc-kernel-notes -> imported/doc-kernel-notes",
      "task-search-17 -> task-search-17",
      "run-docs-004 -> run-docs-004",
    ],
    traceRefs: ["trace-e2e-proof preserved", "artifact-review-012 remapped"],
    sourceEvent: "source import event: package imported from review handoff artifact at 2026-05-18 10:35",
    overwriteGuard: "No overwrite until conflict preview accepted.",
  };

  const STATUS_COPY: Record<DependencyStatus, string> = {
    done: "done",
    running: "running",
    blocked: "blocked",
    waiting: "waiting",
  };

  const STATUS_ICON: Record<DependencyStatus, string> = {
    done: "✓",
    running: "●",
    blocked: "!",
    waiting: "○",
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
  let hydrated = $state(false);
  let dependencyTasks = $state<DependencyTask[]>(DEPENDENCY_TASKS);
  let exportScope = $state<ExportScope>("subtree");
  let exportArtifactAttached = $state(false);
  let runFeedback = $state([
    "Run state loaded from dependency execution API snapshot",
    "Blocked node task-build explains approval gate before write",
  ]);

  const blockedTasks = $derived(dependencyTasks.filter((task) => task.blocker));
  const activeTask = $derived(dependencyTasks.find((task) => task.status === "running") ?? dependencyTasks[0]);
  const exportPackage = $derived(EXPORT_PACKAGES[exportScope]);

  const filteredResults = $derived.by(() => RESULTS.filter((result) =>
    (!selectedProject || result.project === selectedProject)
    && (!selectedTask || result.task === selectedTask)
    && (!selectedRun || result.run === selectedRun)
    && (!selectedDocType || result.docType === selectedDocType)
    && (!selectedOwner || result.owner === selectedOwner)
    && (!selectedAttachment || (selectedAttachment === "with attachments" ? result.hasAttachment : !result.hasAttachment))
  ));

  onMount(() => {
    hydrated = true;
  });

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

  function attachExportArtifact(): void {
    exportArtifactAttached = true;
  }
</script>

<svelte:head>
  <title>Build graph</title>
</svelte:head>

<main data-build-graph-search data-build-graph-ready={hydrated ? "true" : "false"} class={cn("min-h-screen overflow-x-hidden bg-background text-foreground")}>
  <div class={cn("mx-auto flex max-w-7xl min-w-0 flex-col gap-4 px-4 py-4 lg:px-6")}>
    <header data-build-graph-header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div>
        <p data-contrast-sample class={cn("type-caption uppercase text-fg-subtle")}>Build graph</p>
        <h1 class={cn("type-h1")}>Task dependency execution</h1>
        <p data-contrast-sample class={cn("type-body mt-1 max-w-2xl text-fg-subtle")}>
          Inspect execution order, run state, blockers, feedback, and source refs before dispatch.
        </p>
      </div>
      <div data-permission-copy data-contrast-sample class={cn("type-caption rounded-md border border-border-strong bg-muted px-3 py-2 text-foreground")}>
        Permissions filter before results render. Unauthorized titles stay hidden.
      </div>
    </header>

    <section data-type-scale-fixture class={cn("rounded-md border border-border bg-card p-3")}>
      <div class={cn("grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <div class={cn("min-w-0")}>
          <p data-type-token="caption" data-contrast-sample class={cn("type-caption uppercase text-fg-subtle")}>Typography reference</p>
          <p data-type-token="display" data-contrast-sample class={cn("type-display text-foreground")}>Execution graph</p>
          <p data-type-token="body" data-contrast-sample class={cn("type-body max-w-2xl text-fg-subtle")}>
            Semantic type tokens keep hierarchy stable across graph panels, forms, results, and mobile states.
          </p>
        </div>
        <div class={cn("min-w-0 space-y-2")}>
          <h1 data-type-token="h1" class={cn("type-h1")}>H1 dependency title</h1>
          <h2 data-type-token="h2" class={cn("type-h2")}>H2 execution section</h2>
          <h3 data-type-token="h3" class={cn("type-h3")}>H3 result card title</h3>
          <code data-type-token="code" class={cn("type-code block rounded-sm bg-muted px-2 py-1 text-foreground")}>trace:build-graph/type-scale</code>
        </div>
      </div>
    </section>

    <section data-doc-collab-fixture class={cn("grid min-w-0 gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
      <div class={cn("min-w-0 space-y-3")}>
        <div>
          <p class={cn("type-caption uppercase text-fg-subtle")}>Docs collaboration</p>
          <h2 class={cn("type-h2 text-foreground")}>Presence and safe save state</h2>
        </div>
        <div data-connected-users class={cn("flex flex-wrap gap-2")}>
          {#each ["mkh editing intro", "ada reviewing scope", "agent-runner resolving refs"] as user}
            <span class={cn("rounded-sm border border-border bg-muted px-2 py-1 text-xs text-foreground")}>{user}</span>
          {/each}
        </div>
        <div data-cursor-overlays class={cn("grid gap-2 text-xs text-muted-foreground")}>
          <span>mkh cursor: paragraph 2, offset 41</span>
          <span>ada cursor: checklist item 4, offset 12</span>
        </div>
      </div>
      <div class={cn("min-w-0 space-y-3")}>
        <div class={cn("flex flex-wrap gap-2")}>
          <span data-collab-connection-state class={cn("rounded-sm border border-success/40 bg-success/10 px-2 py-1 text-xs text-success")}>connected</span>
          <span data-collab-save-state class={cn("rounded-sm border border-border px-2 py-1 text-xs text-foreground")}>last saved 2026-05-18 08:24</span>
        </div>
        <div data-collab-risk-state class={cn("rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive")}>
          Offline edits are held locally until reconnect; retry save is visible before navigation.
        </div>
        <button type="button" data-collab-retry-save class={cn("h-9 rounded-md border border-border px-3 text-sm font-medium")}>Retry save</button>
        <ul data-collab-history-context class={cn("space-y-1 text-xs text-muted-foreground")}>
          <li>Revision 12 · mkh · saved accepted copy</li>
          <li>Revision 13 · agent-runner · conflict-safe merge</li>
        </ul>
        <p data-collab-flag-off class={cn("text-xs text-muted-foreground")}>Flag off: single-user save remains available; no dead presence controls render.</p>
      </div>
    </section>

    <section data-doc-import-export-workflow class={cn("grid min-w-0 gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
      <div data-doc-export-panel class={cn("min-w-0 space-y-3")}>
        <div class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3")}>
          <div>
            <p data-contrast-sample class={cn("type-caption uppercase text-fg-subtle")}>Document export</p>
            <h2 class={cn("type-h2 text-foreground")}>Package manifest preview</h2>
            <p data-contrast-sample class={cn("mt-1 text-xs text-fg-subtle")}>Exports show contents before handoff, including body, frontmatter, attachments, links, and trace refs.</p>
          </div>
          <label data-contrast-sample class={cn("text-xs font-medium text-fg-subtle")}>
            Scope
            <select data-export-scope bind:value={exportScope} class={cn("mt-1 h-8 rounded-sm border border-input bg-background px-2 text-sm text-foreground")}>
              <option value="single">single doc</option>
              <option value="subtree">subtree</option>
            </select>
          </label>
        </div>

        <div data-export-manifest data-contrast-sample class={cn("rounded-sm border border-border bg-background p-3 text-xs text-foreground")}>
          <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
            <span class={cn("font-semibold")}>{exportPackage.label}</span>
            <span>{exportPackage.manifestVersion}</span>
          </div>
          <p class={cn("mt-2 text-fg-subtle")}>root:{exportPackage.rootDoc} docs:{exportPackage.docs.length}</p>
        </div>

        <div class={cn("grid gap-3 md:grid-cols-2")}>
          <div data-export-body data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>
            Body: {exportPackage.bodyFormat}
          </div>
          <div data-export-frontmatter data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>
            Frontmatter: {exportPackage.frontmatterFields.join(", ")}
          </div>
          <div data-export-attachments data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>
            Attachments: {exportPackage.attachments.join(", ")}
          </div>
          <div data-export-link-map data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>
            Link map: {exportPackage.linkMap.join("; ")}
          </div>
        </div>

        <div data-export-trace-refs data-contrast-sample class={cn("rounded-sm border border-border-strong bg-background p-3 text-xs text-foreground")}>
          Trace refs: {exportPackage.traceRefs.join(", ")}
        </div>
        <div data-export-metadata-policy data-contrast-sample class={cn("rounded-sm border border-border bg-muted px-2 py-1.5 text-xs text-foreground")}>
          {exportPackage.metadataPolicy}
        </div>
        <div class={cn("flex flex-wrap items-center gap-2")}>
          <button data-attach-export-artifact type="button" onclick={attachExportArtifact} class={cn("rounded-sm border border-border-strong px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Attach to review artifact</button>
          <span data-export-artifact-status data-contrast-sample class={cn("rounded-sm bg-muted px-2 py-1.5 text-xs text-foreground")}>
            {exportArtifactAttached ? `attached:${exportPackage.artifactTarget}` : "artifact attachment ready"}
          </span>
        </div>
      </div>

      <div data-doc-import-preview class={cn("min-w-0 space-y-3")}>
        <div class={cn("border-b border-border pb-3")}>
          <p data-contrast-sample class={cn("type-caption uppercase text-fg-subtle")}>Import preview</p>
          <h2 class={cn("type-h2 text-foreground")}>Conflict-safe destination</h2>
          <p data-import-destination data-contrast-sample class={cn("mt-1 text-xs text-fg-subtle")}>Destination: {IMPORT_PREVIEW.destination}</p>
        </div>

        <div class={cn("space-y-2")}>
          {#each IMPORT_PREVIEW.conflicts as conflict (conflict.id)}
            <article data-import-conflict-row data-contrast-sample class={cn("rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground")}>
              <div class={cn("font-semibold")}>Conflict: {conflict.incoming}</div>
              <p class={cn("mt-1 text-fg-subtle")}>Existing: {conflict.existing}</p>
              <p class={cn("mt-1")}>Resolution: {conflict.resolution}</p>
            </article>
          {/each}
        </div>

        <div class={cn("grid gap-3 md:grid-cols-2")}>
          <div data-missing-attachment-list class={cn("space-y-2")}>
            {#each IMPORT_PREVIEW.missingAttachments as attachment}
              <p data-missing-attachment-row data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>{attachment}</p>
            {/each}
          </div>
          <div data-remapped-link-list class={cn("space-y-2")}>
            {#each IMPORT_PREVIEW.remappedLinks as link}
              <p data-remapped-link-row data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>{link}</p>
            {/each}
          </div>
        </div>

        <div data-import-trace-refs class={cn("space-y-2")}>
          {#each IMPORT_PREVIEW.traceRefs as traceRef}
            <p data-import-trace-ref data-contrast-sample class={cn("rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-foreground")}>{traceRef}</p>
          {/each}
        </div>
        <p data-source-import-event data-contrast-sample class={cn("rounded-sm bg-muted p-3 text-xs text-foreground")}>{IMPORT_PREVIEW.sourceEvent}</p>
        <p data-import-overwrite-guard data-contrast-sample class={cn("rounded-sm border border-border-strong bg-background px-2 py-1.5 text-xs font-medium text-foreground")}>{IMPORT_PREVIEW.overwriteGuard}</p>
      </div>
    </section>

    <section data-dependency-panel class={cn("grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]")}>
      <div class={cn("min-w-0 rounded-md border border-border bg-card")}>
        <div class={cn("flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2")}>
          <div>
            <h2 class={cn("type-caption text-foreground")}>Dependency order</h2>
            <p data-contrast-sample class={cn("mt-0.5 text-xs text-fg-subtle")}>Current active node: {activeTask.title}</p>
          </div>
          <span data-run-state data-contrast-sample class={cn("rounded-sm border border-border-strong bg-muted px-2 py-1 text-xs font-medium text-foreground")}>run:{runState}</span>
        </div>

        <div class={cn("grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4")}>
          {#each dependencyTasks as task (task.id)}
            <article data-dependency-node data-task-id={task.id} class={cn("min-w-0 rounded-sm border border-border bg-background p-3")}>
              <div class={cn("flex items-start justify-between gap-2")}>
                <span data-dependency-order class={cn("grid size-7 shrink-0 place-items-center rounded-sm bg-muted text-xs font-semibold")}>{task.order}</span>
                <span data-node-status data-contrast-sample class={cn(
                  "inline-flex items-center gap-1 rounded-sm border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground",
                  task.status === "done" && "border-success/70",
                  task.status === "running" && "border-primary/70",
                  task.status === "blocked" && "border-destructive/70",
                  task.status === "waiting" && "border-border-strong",
                )}><span aria-hidden="true">{STATUS_ICON[task.status]}</span>{STATUS_COPY[task.status]}</span>
              </div>
              <h3 class={cn("type-caption mt-3 text-foreground")}>{task.title}</h3>
              <p data-contrast-sample class={cn("mt-1 text-xs text-fg-subtle")}>owner:{task.owner}</p>
              <div data-dependency-edges class={cn("mt-3 flex flex-wrap gap-1")}>
                {#if task.dependencies.length === 0}
                  <span data-contrast-sample class={cn("rounded-xs bg-muted px-1.5 py-0.5 text-xs text-foreground")}>root</span>
                {:else}
                  {#each task.dependencies as dependency}
                    <span data-dependency-chip data-contrast-sample class={cn("max-w-full break-all rounded-xs bg-muted px-1.5 py-0.5 text-xs text-foreground")}>{dependency}</span>
                  {/each}
                {/if}
              </div>
              <p data-node-feedback data-contrast-sample class={cn("mt-3 text-xs text-fg-subtle")}>{task.feedback}</p>
              {#if task.blocker}
                <p data-blocker-row data-contrast-sample class={cn("mt-2 rounded-sm border border-destructive/70 bg-muted px-2 py-1 text-xs font-medium text-foreground")}>
                  <span aria-hidden="true">!</span> {task.blocker}
                </p>
              {/if}
            </article>
          {/each}
        </div>
      </div>

      <aside data-run-feedback-panel class={cn("space-y-3 rounded-md border border-border bg-card p-3")}>
        <div>
          <h2 class={cn("type-caption text-foreground")}>Execution feedback</h2>
          <p data-contrast-sample class={cn("mt-1 text-xs text-fg-subtle")}>{blockedTasks.length} blockers visible before dispatch.</p>
        </div>
        <div data-run-actions class={cn("grid gap-2 sm:grid-cols-3")}>
          <button data-action-dispatch type="button" onclick={dispatchDependencyRun} class={cn("min-w-0 rounded-sm border border-border-strong px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Dispatch</button>
          <button data-action-retry type="button" onclick={retryBlockedRun} class={cn("min-w-0 rounded-sm border border-border-strong px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Retry</button>
          <button data-action-cancel type="button" onclick={cancelDependencyRun} class={cn("min-w-0 rounded-sm border border-border-strong px-2 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Cancel</button>
        </div>
        <div class={cn("space-y-2")}>
          {#each runFeedback as feedback}
            <p data-feedback-row data-contrast-sample class={cn("rounded-sm bg-muted px-2 py-1.5 text-xs text-foreground")}>{feedback}</p>
          {/each}
        </div>
      </aside>
    </section>

    <section data-search-toolbar class={cn("grid gap-3 rounded-md border border-border bg-card p-3 lg:grid-cols-[minmax(280px,1fr)_auto]")}>
      <label class={cn("type-caption text-foreground")}>
        Search
        <input
          data-doc-search-input
          class={cn("mt-1 h-9 w-full rounded-sm border border-input bg-background px-3 text-sm")}
          type="search"
          value="kernel"
          aria-label="Search docs"
        />
      </label>
      <div data-ranking-explanation data-contrast-sample class={cn("self-end rounded-sm bg-muted px-3 py-2 text-xs text-foreground")}>
        Ranking: title match, snippet match, backlink count, updated time.
      </div>
    </section>

    <section data-form-field-fixture class={cn("rounded-md border border-border bg-card p-3")}>
      <div class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3")}>
        <div>
          <h2 class={cn("type-caption text-foreground")}>Form field reference</h2>
          <p data-contrast-sample class={cn("mt-1 max-w-2xl text-xs text-fg-subtle")}>
            Block and compact labels, every text-like input type, validation states, disabled fields, and textarea counters.
          </p>
        </div>
        <span data-contrast-sample class={cn("rounded-sm border border-border-strong bg-muted px-2 py-1 text-xs text-foreground")}>spec-backed</span>
      </div>

      <div data-form-field-grid class={cn("mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3")}>
        <label data-form-field data-field-type="text" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Task name
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="text" value="Rotate session keys" />
        </label>

        <label data-form-field data-field-type="email" data-field-layout="block" data-field-state="error" class={cn("min-w-0 text-xs font-medium text-destructive")}>
          Reviewer email
          <input data-form-control aria-invalid="true" aria-describedby="reviewer-email-error" class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-destructive bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-destructive/30")} type="email" value="ops@" />
          <span id="reviewer-email-error" data-field-message class={cn("mt-1 block text-xs text-destructive")}>Enter a complete email address.</span>
        </label>

        <label data-form-field data-field-type="password" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Secret token
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="password" value="fulcrum-token" />
        </label>

        <label data-form-field data-field-type="number" data-field-layout="inline" data-field-state="success" class={cn("grid min-w-0 items-center gap-2 text-xs font-medium text-foreground sm:grid-cols-[minmax(92px,200px)_minmax(0,1fr)]")}>
          <span class={cn("max-w-[200px]")}>Retry limit</span>
          <span class={cn("min-w-0")}>
            <input data-form-control aria-describedby="retry-limit-success" class={cn("h-9 w-full min-w-0 rounded-sm border border-success bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-success/30")} type="number" value="3" min="0" max="9" />
            <span id="retry-limit-success" data-field-message class={cn("mt-1 flex items-center gap-1 text-xs text-success")}><span aria-hidden="true">✓</span>Limit accepted.</span>
          </span>
        </label>

        <label data-form-field data-field-type="url" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Repository URL
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="url" value="https://github.com/moabualruz/fulcrum" />
        </label>

        <label data-form-field data-field-type="tel" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Incident phone
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="tel" value="+1 415 555 0199" />
        </label>

        <label data-form-field data-field-type="search" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Filter tasks
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="search" value="blocked auth" />
        </label>

        <label data-form-field data-field-type="date" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Due date
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="date" value="2026-05-18" />
        </label>

        <label data-form-field data-field-type="time" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Review time
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="time" value="16:30" />
        </label>

        <label data-form-field data-field-type="datetime-local" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground")}>
          Dispatch window
          <input data-form-control class={cn("mt-1 h-9 w-full min-w-0 rounded-sm border border-input bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")} type="datetime-local" value="2026-05-18T16:30" />
        </label>

        <label data-form-field data-field-type="text" data-field-layout="block" data-field-state="disabled" class={cn("min-w-0 text-xs font-medium text-fg-subtle")}>
          Locked branch
          <input data-form-control disabled class={cn("mt-1 h-9 w-full min-w-0 cursor-not-allowed rounded-sm border border-input bg-muted px-3 text-sm text-fg-disabled outline-none")} type="text" value="auth/rewrite" />
        </label>

        <label data-form-field data-field-type="textarea" data-field-layout="block" class={cn("min-w-0 text-xs font-medium text-foreground xl:col-span-2")}>
          Review note
          <textarea data-form-control data-character-counter="64/180" aria-describedby="review-note-counter" rows="3" maxlength="180" class={cn("mt-1 min-h-20 max-h-36 w-full min-w-0 resize-y rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60")}>Confirm dependency path before dispatching the blocked auth node.</textarea>
          <span id="review-note-counter" data-field-message class={cn("mt-1 block text-xs text-fg-subtle")}>64/180 characters</span>
        </label>
      </div>
    </section>

    <div class={cn("grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]")}>
      <aside data-doc-search-filters class={cn("space-y-3 rounded-md border border-border bg-card p-3")}>
        <div class={cn("flex items-center justify-between")}>
          <h2 class={cn("type-caption text-foreground")}>Filters</h2>
          <button data-reset-filters type="button" onclick={resetFilters} class={cn("text-xs text-fg-subtle underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Reset</button>
        </div>

        <label data-contrast-sample class={cn("block text-xs font-medium text-fg-subtle")}>
          Project
          <select data-filter-project bind:value={selectedProject} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            {#each FILTERS.project as item}
              <option value={item}>{item}</option>
            {/each}
          </select>
        </label>

        <label data-contrast-sample class={cn("block text-xs font-medium text-fg-subtle")}>
          Task
          <select data-filter-task bind:value={selectedTask} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any task</option>
            {#each FILTERS.task as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label data-contrast-sample class={cn("block text-xs font-medium text-fg-subtle")}>
          Run
          <select data-filter-run bind:value={selectedRun} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any run</option>
            {#each FILTERS.run as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label data-contrast-sample class={cn("block text-xs font-medium text-fg-subtle")}>
          Document type
          <select data-filter-doc-type bind:value={selectedDocType} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any type</option>
            {#each FILTERS.docType as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label data-contrast-sample class={cn("block text-xs font-medium text-fg-subtle")}>
          Owner
          <select data-filter-owner bind:value={selectedOwner} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any owner</option>
            {#each FILTERS.owner as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>

        <label data-contrast-sample class={cn("block text-xs font-medium text-fg-subtle")}>
          Attachments
          <select data-filter-attachments bind:value={selectedAttachment} class={cn("mt-1 h-8 w-full rounded-sm border border-input bg-background px-2 text-sm")}>
            <option value="">Any attachment state</option>
            {#each FILTERS.attachments as item}<option value={item}>{item}</option>{/each}
          </select>
        </label>
      </aside>

      <section data-doc-search-results class={cn("min-w-0 rounded-md border border-border bg-card")}>
        <div class={cn("flex items-center justify-between border-b border-border px-3 py-2")}>
          <h2 class={cn("type-caption text-foreground")}>Results</h2>
          <span data-result-count data-contrast-sample class={cn("text-xs text-fg-subtle")}>{filteredResults.length} visible</span>
        </div>

        <div class={cn("divide-y divide-border")}>
          {#each filteredResults as result (result.id)}
            <article data-doc-result data-doc-id={result.id} class={cn("p-3")}>
              <div class={cn("flex flex-wrap items-center gap-2")}>
                <h3 class={cn("type-caption text-foreground")}>{result.title}</h3>
                <span data-doc-type data-contrast-sample class={cn("rounded-xs border border-border-strong px-1.5 py-0.5 text-xs text-foreground")}>{result.docType}</span>
                <span data-doc-scope data-contrast-sample class={cn("rounded-xs bg-muted px-1.5 py-0.5 text-xs text-foreground")}>{result.scope}</span>
              </div>
              <p data-doc-snippet data-contrast-sample class={cn("mt-2 text-sm text-fg-subtle")}>
                <mark class={cn("bg-accent/20 text-foreground")}>Search</mark>{result.snippet.slice("Search".length)}
              </p>
              <div class={cn("mt-2 flex flex-wrap gap-2 text-xs text-fg-subtle")}>
                <span data-updated-at>{result.updatedAt}</span>
                <span data-owner>owner:{result.owner}</span>
                <span data-graph-counts>{result.graphCounts.backlinks} backlinks, {result.graphCounts.tasks} tasks, {result.graphCounts.runs} runs</span>
                <span data-attachment-state>{result.hasAttachment ? "attachment" : "no attachment"}</span>
              </div>
              <div data-result-actions class={cn("mt-3 flex flex-wrap gap-2")}>
                <a data-action-open href={`/docs/${result.id}`} class={cn("rounded-sm border border-border-strong px-2 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Open</a>
                <button data-action-context type="button" onclick={() => addToPlanningContext(result)} class={cn("rounded-sm border border-border-strong px-2 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Add to planning context</button>
                <button data-action-copy type="button" onclick={() => copyLink(result)} class={cn("rounded-sm border border-border-strong px-2 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Copy link</button>
                <button data-action-reveal type="button" onclick={() => revealInTree(result)} class={cn("rounded-sm border border-border-strong px-2 py-1 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>Reveal in tree</button>
              </div>
            </article>
          {/each}
        </div>
      </section>

      <aside data-planning-context class={cn("space-y-3 rounded-md border border-border bg-card p-3")}>
        <div>
          <h2 class={cn("type-caption text-foreground")}>Planning context</h2>
          <p data-contrast-sample class={cn("mt-1 text-xs text-fg-subtle")}>Selected source refs stay deterministic for the next planning session.</p>
        </div>
        <div data-selected-context class={cn("space-y-1 text-sm")}>
          {#if planningContext.length === 0}
            <p data-contrast-sample class={cn("text-fg-subtle")}>No docs selected.</p>
          {:else}
            {#each planningContext as id}
              <div data-context-ref class={cn("rounded-sm bg-muted px-2 py-1 font-mono text-xs")}>{id}</div>
            {/each}
          {/if}
        </div>
        <div data-tree-reveal data-contrast-sample class={cn("rounded-sm bg-muted px-2 py-1 text-xs text-foreground")}>
          Tree reveal: {revealedTreeNode || "none"}
        </div>
        <div data-copied-link data-contrast-sample class={cn("rounded-sm bg-muted px-2 py-1 text-xs text-foreground")}>
          Copied link: {copiedLink || "none"}
        </div>
      </aside>
    </div>
  </div>
</main>
