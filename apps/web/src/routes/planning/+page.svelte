<script lang="ts">
  type Breakdown = {
    title?: string;
    docs?: Array<{ clientKey?: string; input?: { title?: string } }>;
    taskDrafts?: Array<{
      clientKey?: string;
      input?: { title?: string; description?: string };
      blockedByClientKeys?: string[];
      successCriteria?: Array<{ id?: string; text?: string }>;
      traceId?: string;
    }>;
    warnings?: string[];
  };

  type PlanningContextPayload = {
    sourceRefs?: Array<{ kind?: string; id?: string }>;
    selectedDocs?: Array<{
      id?: string;
      title?: string;
      breadcrumb?: string;
      versionId?: string;
      updatedAt?: string;
      truncated?: boolean;
    }>;
    contextMarkdown?: string;
  };

  type ActionForm = {
    ok?: boolean;
    mode?: "preview" | "materialize" | "freeformPrompt" | "freeformStart" | "guidedAcpStart" | "continuousUpdate" | "generate" | "workflowCycle";
    error?: string;
    preview?: Breakdown;
    materialized?: { breakdown?: Breakdown; materialization?: { docs?: Array<{ id: string }>; tasks?: Array<{ id: string }> } };
    freeformStart?: {
      status?: string;
      document?: { id?: string; title?: string };
      context?: PlanningContextPayload;
      prompt?: string;
    };
    freeformPrompt?: {
      context?: PlanningContextPayload;
      prompt?: string;
    };
    guidedAcpStart?: {
      status?: string;
      session?: {
        acpSessionId?: string;
        agentName?: string;
        cwd?: string;
        modeId?: string;
        modelId?: string;
        permissionMode?: string;
      };
      permissionOptions?: Array<{ optionId?: string; name?: string }>;
      traffic?: { entries?: Array<{ method?: string }> };
      context?: PlanningContextPayload;
      prompt?: string;
    };
    continuousUpdate?: {
      status?: string;
      traceId?: string;
      acpSessionId?: string;
      targetTaskIds?: string[];
      targetTasks?: Array<{ id?: string; title?: string; status?: string | null }>;
      missingTargetTaskIds?: string[];
      changedDocs?: Array<{ id?: string; title?: string }>;
      context?: PlanningContextPayload;
      prompt?: string;
    };
    technicalPlanning?: {
      status?: string;
      eventId?: string;
      reviewPrompt?: string;
      plan?: {
        planId?: string;
        reviewId?: string;
        title?: string;
        traceId?: string;
        source?: string;
        markdown?: string;
        prototypePaths?: string[];
        boilerplatePaths?: string[];
      };
      artifactPreviews?: Array<{
        id?: string;
        kind?: string;
        path?: string;
        label?: string;
        mode?: string;
        urlPath?: string;
        run?: { command?: string; args?: string[] };
        reviewChecks?: string[];
      }>;
      breakdown?: Breakdown;
    };
    workflowCycle?: {
      traceId?: string;
      finalQa?: { status?: string };
      generatedE2e?: {
        status?: string;
        testFiles?: string[];
      };
    };
  } | null;

  type Props = {
    data: { defaultPlanId: string; defaultTraceId: string };
    form?: ActionForm;
  };

  let { data, form = null }: Props = $props();

  let breakdown = $derived(form?.preview ?? form?.materialized?.breakdown ?? form?.technicalPlanning?.breakdown ?? null);
  let materialization = $derived(form?.materialized?.materialization ?? null);
  let freeformStart = $derived(form?.freeformStart ?? null);
  let freeformPrompt = $derived(form?.freeformPrompt ?? null);
  let guidedAcpStart = $derived(form?.guidedAcpStart ?? null);
  let continuousUpdate = $derived(form?.continuousUpdate ?? null);
  let technicalPlanning = $derived(form?.technicalPlanning ?? null);
  let workflowCycle = $derived(form?.workflowCycle ?? null);
  let contextSources = $derived(freeformStart?.context ?? freeformPrompt?.context ?? guidedAcpStart?.context ?? continuousUpdate?.context ?? null);
  const defaultWorkflowCycleJson = JSON.stringify({
    traceId: "trace_web",
    projectId: null,
    freeform: {
      title: "New work brief",
      bodyMd: "Capture goals, constraints, and success criteria.",
    },
  }, null, 2);
</script>

<svelte:head>
  <title>Planning</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" data-planning-page>
  <header class="flex flex-col gap-2 border-b border-border pb-4">
    <h1 class="text-2xl font-semibold tracking-normal text-foreground">Planning</h1>
  </header>

  <form method="POST" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-planning-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Plan markdown
        <textarea
          class="min-h-80 resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-6 text-foreground"
          name="approvedPlanMarkdown"
          spellcheck="false"
        ># Approved Plan

## Tasks
- [T1] Build the next workflow slice
  Depends on: none
  Success: Web, CLI, and TUI expose the same trace id.
</textarea>
      </label>
      <div class="flex flex-wrap gap-2">
        <button
          class="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          type="submit"
          formaction="?/preview"
        >
          Preview
        </button>
        <button
          class="inline-flex h-10 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
          type="submit"
          formaction="?/materialize"
        >
          Materialize
        </button>
      </div>
    </section>

    <aside class="grid h-max gap-3 rounded-md border border-border p-4">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Plan ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="planId" value={data.defaultPlanId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Project ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Trace ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Review ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="reviewId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Cycle ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="cycleId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Module ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="moduleId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Source docs
        <input
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="sourceDocRefs"
          placeholder="doc:doc_1,doc:doc_2"
        />
      </label>
    </aside>
  </form>

  <form method="POST" class="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-freeform-start-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Freeform title
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="freeformTitle" value="New work brief" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Freeform document
        <textarea
          class="min-h-36 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="freeformBodyMd"
        >Capture the rough goals, constraints, and success criteria here.</textarea>
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        ACP planning request
        <textarea
          class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="freeformUserPrompt"
        >Plan from this freeform document and produce a prototype-first implementation plan.</textarea>
      </label>
      <button
        class="inline-flex h-10 w-max items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        type="submit"
        formaction="?/freeformStart"
      >
        Start Freeform Work
      </button>
    </section>

    <aside class="grid h-max gap-3 rounded-md border border-border p-4">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Project ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Parent doc
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="parentId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Trace ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        ACP session
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpSessionId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Mode
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modeId" value="planning" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Model
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modelId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Max chars
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
      </label>
    </aside>
  </form>

  <form method="POST" class="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-guided-acp-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Agent
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpAgentName" value="codex" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        CWD
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpCwd" value="/Users/mkh/workspace/fulcrum" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Guided ACP request
        <textarea
          class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="acpUserPrompt"
        >Plan with selected context through ACP and preserve permissions and traffic.</textarea>
      </label>
      <button
        class="inline-flex h-10 w-max items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
        type="submit"
        formaction="?/guidedAcpStart"
      >
        Start ACP Planning
      </button>
    </section>

    <aside class="grid h-max gap-3 rounded-md border border-border p-4">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        ACP session
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpSessionId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Prompt template
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpPromptTemplateId" value="prototype-first" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Selected docs
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="selectedDocIds" placeholder="doc uuid,doc uuid" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Project ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Trace ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Mode
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modeId" value="planning" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Model
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modelId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Permissions
        <select class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpPermissionMode">
          <option value="review_each_tool">Review each tool</option>
          <option value="allow_workspace">Allow workspace</option>
          <option value="read_only">Read only</option>
        </select>
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Max chars
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
      </label>
    </aside>
  </form>

  <form method="POST" class="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-continuous-update-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Update trigger
        <select class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="continuousTrigger">
          <option value="manual_doc_edit">Manual doc edit</option>
          <option value="acp_session_update">ACP session update</option>
        </select>
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Updated planning request
        <textarea
          class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="continuousUserPrompt"
        >Replan from updated freeform documents and keep the task tree traceable.</textarea>
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Changed doc
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="continuousDocId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Changed title
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="continuousTitle" value="Updated work brief" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Changed document
        <textarea
          class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="continuousBodyMd"
        >Updated goals, constraints, and success criteria.</textarea>
      </label>
      <button
        class="inline-flex h-10 w-max items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
        type="submit"
        formaction="?/continuousUpdate"
      >
        Restart Planning Cycle
      </button>
    </section>

    <aside class="grid h-max gap-3 rounded-md border border-border p-4">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Selected docs
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="selectedDocIds" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Target tasks
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="targetTaskIds" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Project ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Trace ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        ACP session
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="acpSessionId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Mode
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modeId" value="planning" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Model
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="modelId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Max chars
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
      </label>
    </aside>
  </form>

  <form method="POST" class="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-technical-planning-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Source
        <select class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="technicalSource">
          <option value="freeform_docs">Freeform docs</option>
          <option value="guided_acp">Guided ACP</option>
          <option value="continuous_update">Continuous update</option>
        </select>
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Planning request
        <textarea
          class="min-h-28 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="technicalUserPrompt"
        >Generate a technical plan with reviewable prototype and boilerplate artifacts.</textarea>
      </label>
      <button
        class="inline-flex h-10 w-max items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
        type="submit"
        formaction="?/generate"
      >
        Generate Plan
      </button>
    </section>

    <aside class="grid h-max gap-3 rounded-md border border-border p-4">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Selected docs
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="selectedDocIds" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Project ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="projectId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Trace ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="traceId" value={data.defaultTraceId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Plan ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="planId" value={data.defaultPlanId} />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Review ID
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="reviewId" />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Prototype paths
        <input
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="prototypePaths"
          value="apps/web/src/routes/planning/workbench-prototype.tsx"
        />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Boilerplate paths
        <input
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="boilerplatePaths"
          value="services/planning-review/src/application/technical-planning-cycle.ts"
        />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Success criteria
        <input
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="successCriteria"
          value="Prototype and boilerplate artifacts are visible before approval."
        />
      </label>
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Max chars
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
      </label>
    </aside>
  </form>

  <form method="POST" class="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-workflow-cycle-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Workflow cycle payload
        <textarea
          class="min-h-44 resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-6 text-foreground"
          name="workflowCycleJson"
          spellcheck="false"
        >{defaultWorkflowCycleJson}</textarea>
      </label>
      <button
        class="inline-flex h-10 w-max items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
        type="submit"
        formaction="?/workflowCycle"
      >
        Run Cycle
      </button>
    </section>

    <aside class="grid h-max gap-2 rounded-md border border-border p-4 text-sm text-muted-foreground">
      <div>freeform</div>
      <div>planning</div>
      <div>dependency execution</div>
      <div>QA</div>
      <div>UAT</div>
      <div>E2E</div>
    </aside>
  </form>

  <form method="POST" class="grid gap-4 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_20rem]" data-freeform-planning-form>
    <section class="flex min-w-0 flex-col gap-3">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Freeform request
        <textarea
          class="min-h-32 resize-y rounded-md border border-input bg-background p-3 text-sm leading-6 text-foreground"
          name="freeformUserPrompt"
        >Plan from the selected docs and produce a prototype-first implementation plan.</textarea>
      </label>
      <button
        class="inline-flex h-10 w-max items-center rounded-md border border-input px-4 text-sm font-medium text-foreground"
        type="submit"
        formaction="?/freeformPrompt"
      >
        Build ACP prompt
      </button>
    </section>

    <aside class="grid h-max gap-3 rounded-md border border-border p-4">
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Selected docs
        <input
          class="h-10 rounded-md border border-input bg-background px-3 text-sm"
          name="selectedDocIds"
          placeholder="doc uuid,doc uuid"
        />
      </label>
      <input type="hidden" name="projectId" />
      <input type="hidden" name="traceId" value={data.defaultTraceId} />
      <label class="grid gap-1 text-sm font-medium text-foreground">
        Max chars
        <input class="h-10 rounded-md border border-input bg-background px-3 text-sm" name="maxDocChars" value="12000" />
      </label>
    </aside>
  </form>

  {#if form?.ok === false}
    <p class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-planning-error>
      {form.error}
    </p>
  {/if}

  {#if contextSources?.sourceRefs?.length || contextSources?.selectedDocs?.length}
    <section class="grid gap-3 border-t border-border pt-4" data-planning-context-sources>
      <h2 class="text-lg font-semibold text-foreground">Context sources</h2>
      {#if contextSources.selectedDocs?.length}
        <ul class="grid gap-2">
          {#each contextSources.selectedDocs as doc}
            <li class="grid gap-1 rounded-md border border-border p-3 text-sm" data-planning-context-doc={doc.id}>
              <div class="font-medium text-foreground">{doc.breadcrumb ?? doc.title ?? doc.id}</div>
              <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {#if doc.id}<span>{doc.id}</span>{/if}
                {#if doc.versionId}<span>{doc.versionId}</span>{/if}
                {#if doc.updatedAt}<span>{doc.updatedAt}</span>{/if}
                {#if doc.truncated}<span>truncated</span>{/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
      {#if contextSources.sourceRefs?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each contextSources.sourceRefs as ref}
            <span data-planning-context-ref>{ref.kind}:{ref.id}</span>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if breakdown}
    <section class="grid gap-4 border-t border-border pt-4" data-planning-preview>
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-foreground">{breakdown.title}</h2>
        {#if form?.mode}
          <p class="text-sm text-muted-foreground">{form.mode}</p>
        {/if}
      </div>

      {#if breakdown.docs?.length}
        <section class="grid gap-2">
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Docs</h3>
          <ul class="grid gap-2">
            {#each breakdown.docs as doc}
              <li class="rounded-md border border-border p-3 text-sm" data-planning-doc>{doc.input?.title ?? doc.clientKey}</li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if breakdown.taskDrafts?.length}
        <section class="grid gap-2">
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Tasks</h3>
          <ul class="grid gap-2">
            {#each breakdown.taskDrafts as task}
              <li class="grid gap-2 rounded-md border border-border p-3 text-sm" data-planning-task>
                <div class="font-medium text-foreground">{task.input?.title ?? task.clientKey}</div>
                {#if task.traceId}
                  <div class="text-xs text-muted-foreground" data-planning-trace>{task.traceId}</div>
                {/if}
                {#if task.blockedByClientKeys?.length}
                  <div class="text-xs text-muted-foreground">Blocked by {task.blockedByClientKeys.join(", ")}</div>
                {/if}
                {#each task.successCriteria ?? [] as criterion}
                  <div class="text-xs text-foreground" data-planning-success>{criterion.text}</div>
                {/each}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if materialization}
        <section class="grid gap-2" data-planning-materialization>
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Materialized</h3>
          <div class="text-sm text-foreground">{materialization.docs?.length ?? 0} docs, {materialization.tasks?.length ?? 0} tasks</div>
        </section>
      {/if}

      {#if breakdown.warnings?.length}
        <section class="grid gap-2">
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Warnings</h3>
          <ul class="grid gap-1 text-sm text-muted-foreground">
            {#each breakdown.warnings as warning}
              <li data-planning-warning>{warning}</li>
            {/each}
          </ul>
        </section>
      {/if}
    </section>
  {/if}

  {#if technicalPlanning}
    <section class="grid gap-3 border-t border-border pt-4" data-technical-planning>
      <h2 class="text-lg font-semibold text-foreground">Technical planning</h2>
      <div class="grid gap-1 text-sm text-foreground">
        <div>{technicalPlanning.status}</div>
        {#if technicalPlanning.plan?.title}
          <div>{technicalPlanning.plan.title}</div>
        {/if}
        {#if technicalPlanning.plan?.planId}
          <div>{technicalPlanning.plan.planId}</div>
        {/if}
        {#if technicalPlanning.plan?.reviewId}
          <div>{technicalPlanning.plan.reviewId}</div>
        {/if}
        {#if technicalPlanning.plan?.traceId}
          <div>{technicalPlanning.plan.traceId}</div>
        {/if}
        {#if technicalPlanning.plan?.source}
          <div>{technicalPlanning.plan.source}</div>
        {/if}
      </div>
      {#if technicalPlanning.plan?.prototypePaths?.length}
        <section class="grid gap-1 text-sm text-foreground">
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Prototypes</h3>
          {#each technicalPlanning.plan.prototypePaths as path}
            <div>{path}</div>
          {/each}
        </section>
      {/if}
      {#if technicalPlanning.plan?.boilerplatePaths?.length}
        <section class="grid gap-1 text-sm text-foreground">
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Boilerplate</h3>
          {#each technicalPlanning.plan.boilerplatePaths as path}
            <div>{path}</div>
          {/each}
        </section>
      {/if}
      {#if technicalPlanning.artifactPreviews?.length}
        <section class="grid gap-2 text-sm text-foreground" data-planning-artifact-previews>
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Artifact previews</h3>
          {#each technicalPlanning.artifactPreviews as preview}
            <article class="grid gap-1 rounded-md border border-border p-3" data-planning-artifact-preview={preview.id}>
              <div class="font-medium">{preview.label ?? preview.path}</div>
              <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {#if preview.kind}<span>{preview.kind}</span>{/if}
                {#if preview.mode}<span>{preview.mode}</span>{/if}
                {#if preview.urlPath}<span>{preview.urlPath}</span>{/if}
                {#if preview.run}<span>{preview.run.command} {preview.run.args?.join(" ")}</span>{/if}
              </div>
              {#if preview.reviewChecks?.length}
                <ul class="grid gap-1 text-xs text-muted-foreground">
                  {#each preview.reviewChecks as check}
                    <li data-planning-artifact-check>{check}</li>
                  {/each}
                </ul>
              {/if}
            </article>
          {/each}
        </section>
      {/if}
      {#if technicalPlanning.reviewPrompt}
        <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{technicalPlanning.reviewPrompt}</pre>
      {/if}
    </section>
  {/if}

  {#if workflowCycle}
    <section class="grid gap-3 border-t border-border pt-4" data-workflow-cycle-result>
      <h2 class="text-lg font-semibold text-foreground">Workflow cycle</h2>
      <div class="grid gap-1 text-sm text-foreground">
        {#if workflowCycle.traceId}
          <div>{workflowCycle.traceId}</div>
        {/if}
        {#if workflowCycle.finalQa?.status}
          <div>{workflowCycle.finalQa.status}</div>
        {/if}
        {#if workflowCycle.generatedE2e?.status}
          <div>{workflowCycle.generatedE2e.status}</div>
        {/if}
      </div>
      {#if workflowCycle.generatedE2e?.testFiles?.length}
        <div class="grid gap-1 text-sm text-foreground">
          {#each workflowCycle.generatedE2e.testFiles as path}
            <div>{path}</div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if freeformStart}
    <section class="grid gap-3 border-t border-border pt-4" data-freeform-work-start>
      <h2 class="text-lg font-semibold text-foreground">Freeform work started</h2>
      <div class="text-sm text-foreground">{freeformStart.document?.title}</div>
      {#if freeformStart.context?.sourceRefs?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each freeformStart.context.sourceRefs as ref}
            <span>{ref.kind}:{ref.id}</span>
          {/each}
        </div>
      {/if}
      <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{freeformStart.prompt}</pre>
    </section>
  {/if}

  {#if freeformPrompt}
    <section class="grid gap-3 border-t border-border pt-4" data-freeform-planning-prompt>
      <h2 class="text-lg font-semibold text-foreground">Freeform context</h2>
      {#if freeformPrompt.context?.sourceRefs?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each freeformPrompt.context.sourceRefs as ref}
            <span>{ref.kind}:{ref.id}</span>
          {/each}
        </div>
      {/if}
      <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{freeformPrompt.prompt}</pre>
    </section>
  {/if}

  {#if guidedAcpStart}
    <section class="grid gap-3 border-t border-border pt-4" data-guided-acp-start>
      <h2 class="text-lg font-semibold text-foreground">Guided ACP session</h2>
      <div class="grid gap-1 text-sm text-foreground">
        <div>{guidedAcpStart.session?.acpSessionId}</div>
        <div>{guidedAcpStart.session?.agentName}</div>
        <div>{guidedAcpStart.session?.modeId}</div>
        {#if guidedAcpStart.session?.modelId}
          <div>{guidedAcpStart.session.modelId}</div>
        {/if}
        <div>{guidedAcpStart.session?.permissionMode}</div>
      </div>
      {#if guidedAcpStart.context?.sourceRefs?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each guidedAcpStart.context.sourceRefs as ref}
            <span>{ref.kind}:{ref.id}</span>
          {/each}
        </div>
      {/if}
      {#if guidedAcpStart.permissionOptions?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each guidedAcpStart.permissionOptions as option}
            <span>{option.name ?? option.optionId}</span>
          {/each}
        </div>
      {/if}
      {#if guidedAcpStart.traffic?.entries?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each guidedAcpStart.traffic.entries as entry}
            <span>{entry.method}</span>
          {/each}
        </div>
      {/if}
      <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{guidedAcpStart.prompt}</pre>
    </section>
  {/if}

  {#if continuousUpdate}
    <section class="grid gap-3 border-t border-border pt-4" data-continuous-update>
      <h2 class="text-lg font-semibold text-foreground">Continuous update</h2>
      <div class="grid gap-1 text-sm text-foreground">
        <div>{continuousUpdate.status}</div>
        {#if continuousUpdate.traceId}
          <div>{continuousUpdate.traceId}</div>
        {/if}
        {#if continuousUpdate.acpSessionId}
          <div>{continuousUpdate.acpSessionId}</div>
        {/if}
      </div>
      {#if continuousUpdate.targetTaskIds?.length || continuousUpdate.targetTasks?.length || continuousUpdate.missingTargetTaskIds?.length || continuousUpdate.changedDocs?.length}
        <section class="grid gap-2 rounded-md border border-border p-3" data-planning-task-reconciliation>
          <h3 class="text-sm font-semibold uppercase tracking-normal text-muted-foreground">Task reconciliation</h3>
          {#if continuousUpdate.targetTaskIds?.length}
            <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {#each continuousUpdate.targetTaskIds as taskId}
                <span data-reconciliation-target-id>{taskId}</span>
              {/each}
            </div>
          {/if}
          {#if continuousUpdate.targetTasks?.length}
            <div class="grid gap-1 text-sm text-foreground">
              {#each continuousUpdate.targetTasks as task}
                <div data-reconciliation-target-task>{task.title ?? task.id} {task.status ?? ""}</div>
              {/each}
            </div>
          {/if}
          {#if continuousUpdate.missingTargetTaskIds?.length}
            <div class="text-sm text-muted-foreground" data-reconciliation-missing>
              Missing {continuousUpdate.missingTargetTaskIds.join(", ")}
            </div>
          {/if}
          {#if continuousUpdate.changedDocs?.length}
            <div class="grid gap-1 text-sm text-foreground">
              {#each continuousUpdate.changedDocs as doc}
                <div data-reconciliation-changed-doc>{doc.title ?? doc.id}</div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
      {#if continuousUpdate.context?.sourceRefs?.length}
        <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {#each continuousUpdate.context.sourceRefs as ref}
            <span>{ref.kind}:{ref.id}</span>
          {/each}
        </div>
      {/if}
      <pre class="overflow-auto rounded-md border border-border bg-background p-3 text-sm text-foreground">{continuousUpdate.prompt}</pre>
    </section>
  {/if}
</main>
