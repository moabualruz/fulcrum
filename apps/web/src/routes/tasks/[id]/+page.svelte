<script lang="ts">
  import type { TaskDetailPayload, SubtaskRow, EdgeRow, EventRow } from "$lib/server/task-detail";
  import type { TaskStatus } from "$lib/server/tasks";
  import { TASK_STATUSES, describeStatus } from "$lib/components/board/board-helpers";
  import { matchTaskShortcut } from "$lib/components/task-detail/task-detail-helpers";
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils.js";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";

  interface Props {
    data: {
      streamed: { data: Promise<TaskDetailPayload> | TaskDetailPayload };
    };
    form?: TaskRunForm;
  }
  type DependencyRunPreview = {
    traceId?: string;
    mode: string;
    targetTaskIds: string[];
    orderedTaskIds: string[];
    requiresDisclosure: boolean;
    blocked: boolean;
    warnings: string[];
    tasks: Array<{
      id: string;
      title: string;
      column: string;
      dependencyIds: string[];
      blockedBy?: string | null;
    }>;
  };
  type DependencyRunDispatch = {
    runGroupId: string;
    preview: DependencyRunPreview;
    scheduledRuns: Array<{ id: string; taskId: string; agent: string; status: string; queuePosition: number }>;
    skippedTasks: Array<{ id: string; title: string; reason: string }>;
    warnings: string[];
  };
  type DependencyRunFeedback = {
    traceId: string;
    runGroupId: string;
    executorStatus: {
      queuedTaskCount: number;
      runningTaskCount: number;
      succeededTaskCount: number;
      failedTaskCount: number;
      blockedTaskCount: number;
      inReviewCount: number;
      active: boolean;
    };
    runs: Array<{
      id: string;
      taskId: string | null;
      status: string;
      queuePosition: number;
      dependencyIds: string[];
      latestEventSummary: string | null;
    }>;
    events: Array<{
      id: string;
      mutationType: string;
      summary: string;
      output: string | null;
      createdAt: string;
    }>;
  };
  type TaskRunForm = {
    ok?: boolean;
    mode?: "runPreview" | "run" | "runFeedback";
    message?: string;
    preview?: DependencyRunPreview;
    dispatch?: DependencyRunDispatch;
    feedback?: DependencyRunFeedback;
  };
  const { data, form }: Props = $props();

  const isStatus = (s: string): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s);
  const fieldCls = "mt-1 w-full rounded border border-border bg-background p-2";

  let payload = $state<TaskDetailPayload | null>(null);
  let editingTitle = $state(false);
  let activeOverlay = $state<string | null>(null);
  let autosaveStatus = $state<"idle" | "saving" | "saved" | "error">("idle");
  let liveRunFeedback = $state<DependencyRunFeedback | null>(null);
  let liveRunFeedbackSource: EventSource | null = null;
  let displayedRunFeedback = $derived(liveRunFeedback ?? (form?.mode === "runFeedback" && form.ok ? form.feedback ?? null : null));
  const normalizePayload = (p: TaskDetailPayload): TaskDetailPayload => ({
    ...p,
    subtasks: p.subtasks ?? [],
    edges: p.edges ?? [],
    events: p.events ?? [],
  });

  // Sync from streamed
  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) payload = normalizePayload(d);
  }
  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      let cancelled = false;
      void d.then((p) => { if (!cancelled) payload = normalizePayload(p); });
      return () => { cancelled = true; };
    } else {
      payload = normalizePayload(d);
    }
  });

  // Edit state seeded from payload
  let title = $derived(payload?.task.title ?? "");
  let status = $derived(payload?.task.status ?? "pending");
  let priority = $derived(payload?.task.priority ?? 0);
  let description = $derived(payload?.task.description ?? "");

  // Autosave debounce
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  function onDescriptionInput(value: string): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveStatus = "idle";
    autosaveTimer = setTimeout(async () => {
      autosaveStatus = "saving";
      try {
        const fd = new FormData();
        fd.set("description", value);
        await fetch("?/autosave", { method: "POST", body: fd });
        autosaveStatus = "saved";
      } catch {
        autosaveStatus = "error";
      }
    }, 1000);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      activeOverlay = null;
      editingTitle = false;
      return;
    }
    const match = matchTaskShortcut(event);
    if (!match) return;
    event.preventDefault();
    if (match.action === "edit-title") editingTitle = true;
    else activeOverlay = match.action;
  }

  async function postForm(action: string, fields: Record<string, string>): Promise<Response> {
    const fd = new FormData();
    for (const [k, val] of Object.entries(fields)) fd.set(k, val);
    const res = await fetch(`?/${action}`, { method: "POST", body: fd });
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.invalidateAll();
    }
    return res;
  }

  async function onSave(): Promise<void> {
    if (!payload) return;
    await postForm("update", {
      title,
      status,
      priority: String(priority),
      description: description || "",
    });
  }

  async function onDelete(): Promise<void> {
    if (!payload) return;
    await postForm("delete", {});
    if (typeof window !== "undefined") {
      const nav = await import("$app/navigation");
      await nav.goto("/boards");
    }
  }

  function stopRunFeedbackStream(): void {
    liveRunFeedbackSource?.close();
    liveRunFeedbackSource = null;
  }

  function startRunFeedbackStream(feedback: DependencyRunFeedback): void {
    liveRunFeedback = feedback;
    if (typeof EventSource === "undefined" || !feedback.executorStatus.active) return;
    stopRunFeedbackStream();
    const params = new URLSearchParams({
      traceId: feedback.traceId,
      runGroupId: feedback.runGroupId,
    });
    const source = new EventSource(`run-feedback?${params.toString()}`);
    source.addEventListener("feedback", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as DependencyRunFeedback;
      liveRunFeedback = next;
      if (!next.executorStatus.active) stopRunFeedbackStream();
    });
    source.onerror = () => stopRunFeedbackStream();
    liveRunFeedbackSource = source;
  }

  $effect(() => {
    const feedback = form?.mode === "runFeedback" && form.ok ? form.feedback ?? null : null;
    if (!feedback) {
      liveRunFeedback = null;
      stopRunFeedbackStream();
      return;
    }
    startRunFeedbackStream(feedback);
    return stopRunFeedbackStream;
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then _resolved}
  {#if payload}
    <article data-task-detail class="mx-auto max-w-3xl p-6">
      <!-- Header -->
      <header class="mb-6">
        {#if editingTitle}
          <input
            data-task-title-input
            value={title}
            oninput={(e) => { /* title edit handled via form submit */ }}
            onblur={() => (editingTitle = false)}
            class="text-2xl font-bold w-full border-b border-border bg-transparent outline-none"
          />
        {:else}
          <h1
            data-task-title
            class="text-2xl font-bold cursor-pointer hover:text-muted-foreground"
            onclick={() => (editingTitle = true)}
            role="button"
            tabindex="0"
          >{payload.task.title}</h1>
        {/if}
        <div class="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span data-task-status>{describeStatus(payload.task.status)}</span>
          <span>·</span>
          <span data-task-priority>P{payload.task.priority}</span>
          <span>·</span>
          <span data-task-updated>Updated {payload.task.updated_at}</span>
        </div>
      </header>

      <!-- Description with autosave -->
      <section data-task-description class="mb-6">
        <h2 class="text-sm font-semibold text-muted-foreground mb-1">Description</h2>
        <textarea
          data-task-description-input
          value={description}
          oninput={(e) => onDescriptionInput((e.target as HTMLTextAreaElement).value)}
          class={cn(fieldCls, "min-h-32")}
          placeholder="Add a description..."
        ></textarea>
        {#if autosaveStatus === "saving"}
          <span data-autosave-indicator class="text-xs text-muted-foreground">Saving...</span>
        {:else if autosaveStatus === "saved"}
          <span data-autosave-indicator class="text-xs text-green-600">Saved</span>
        {:else if autosaveStatus === "error"}
          <span data-autosave-indicator class="text-xs text-red-600">Error saving</span>
        {/if}
      </section>

      <!-- Subtasks -->
      {#if payload.subtasks.length > 0}
        <section data-task-subtasks class="mb-6">
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">Subtasks ({payload.subtasks.length})</h2>
          <ul class="space-y-1">
            {#each payload.subtasks as sub (sub.id)}
              <li data-subtask-item class="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm">
                <span class="text-muted-foreground">{describeStatus(sub.status)}</span>
                <a href="/tasks/{sub.id}" class="hover:underline">{sub.title}</a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Edges (dependencies) -->
      {#if payload.edges.length > 0}
        <section data-task-edges class="mb-6">
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">Dependencies</h2>
          <div class="flex flex-wrap gap-2">
            {#each payload.edges as edge (edge.id)}
              <span data-edge-chip class="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs">
                {edge.rel}: {edge.from_id === payload.task.id ? edge.to_id : edge.from_id}
              </span>
            {/each}
          </div>
        </section>
      {/if}

      <section data-task-run-controls class="mb-6 border-t border-border pt-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-muted-foreground">Dependency Run</h2>
          <span class="font-mono text-xs text-muted-foreground">{payload.task.id}</span>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <form method="POST" action="?/runPreview" data-task-run-preview-form class="flex items-end gap-2">
            <label class="block flex-1 text-xs text-muted-foreground">
              Trace
              <input name="traceId" value={`trace-${payload.task.id}`} class={cn(fieldCls, "text-xs")} />
            </label>
            <button type="submit" data-task-run-preview class={cn(buttonVariants({ variant: "secondary" }))}>Preview</button>
          </form>
          <form method="POST" action="?/run" data-task-run-form class="grid gap-2">
            <input type="hidden" name="traceId" value={`trace-${payload.task.id}`} />
            <div class="flex items-end gap-2">
              <label class="block flex-1 text-xs text-muted-foreground">
                Agent
                <input name="agent" value="codex" class={cn(fieldCls, "text-xs")} />
              </label>
              <label class="block flex-1 text-xs text-muted-foreground">
                Model
                <input name="model" value="" class={cn(fieldCls, "text-xs")} />
              </label>
              <button type="submit" data-task-run-submit class={cn(buttonVariants({ variant: "default" }))}>Run</button>
            </div>
            <input name="prompt" value={`Run dependency tree for ${payload.task.id}`} class={cn(fieldCls, "text-xs")} />
          </form>
          <form method="POST" action="?/runFeedback" data-task-run-feedback-form class="flex items-end gap-2">
            <label class="block flex-1 text-xs text-muted-foreground">
              Trace
              <input name="traceId" value={form?.dispatch?.runGroupId ?? `trace-${payload.task.id}`} class={cn(fieldCls, "text-xs")} />
            </label>
            <button type="submit" data-task-run-feedback-submit class={cn(buttonVariants({ variant: "secondary" }))}>Feedback</button>
          </form>
        </div>

        {#if form?.ok === false}
          <p data-task-run-error class="mt-3 text-sm text-destructive">{form.message}</p>
        {/if}

        {#if form?.mode === "runPreview" && form.ok && form.preview}
          <div data-task-dependency-graph class="mt-4 space-y-3">
            <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Trace: {form.preview.traceId ?? "none"}</span>
              <span>Targets: {form.preview.targetTaskIds.length}</span>
              <span>Disclosure: {form.preview.requiresDisclosure ? "required" : "none"}</span>
            </div>
            <ol class="space-y-2">
              {#each form.preview.orderedTaskIds as orderedId, index (orderedId)}
                {@const node = form.preview.tasks.find((task) => task.id === orderedId)}
                <li
                  data-task-dependency-node
                  data-task-id={orderedId}
                  data-column={node?.column ?? "unknown"}
                  class="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span class="flex items-center gap-2">
                    <span class="font-mono text-xs text-muted-foreground">{index + 1}</span>
                    <span>{node?.title ?? orderedId}</span>
                  </span>
                  <span class="text-xs text-muted-foreground">{node?.column ?? "unknown"}</span>
                </li>
              {/each}
            </ol>
          </div>
        {/if}

        {#if form?.mode === "run" && form.ok && form.dispatch}
          <div data-task-run-dispatch class="mt-4 space-y-2 text-sm">
            <div class="font-mono text-xs text-muted-foreground">Trace: {form.dispatch.runGroupId}</div>
            <div class="flex flex-wrap gap-2">
              {#each form.dispatch.scheduledRuns as run (run.id)}
                <span data-task-run-scheduled class="rounded-md border border-border px-2 py-1 text-xs">
                  queued {run.taskId} by {run.agent}
                </span>
              {/each}
              {#each form.dispatch.skippedTasks as task (task.id)}
                <span data-task-run-skipped class="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                  skipped {task.id}: {task.reason}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if displayedRunFeedback}
          <div data-task-run-feedback data-task-run-feedback-live class="mt-4 space-y-3 text-sm" aria-live="polite">
            <div class="font-mono text-xs text-muted-foreground">Trace: {displayedRunFeedback.runGroupId}</div>
            <div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Queued: {displayedRunFeedback.executorStatus.queuedTaskCount}</span>
              <span>Running: {displayedRunFeedback.executorStatus.runningTaskCount}</span>
              <span>Succeeded: {displayedRunFeedback.executorStatus.succeededTaskCount}</span>
              <span>Failed: {displayedRunFeedback.executorStatus.failedTaskCount}</span>
            </div>
            <div class="space-y-2">
              {#each displayedRunFeedback.runs as run (run.id)}
                <div data-task-run-feedback-run class="rounded-md border border-border px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono text-xs">{run.queuePosition}. {run.id}</span>
                    <span class="text-xs text-muted-foreground">{run.status}</span>
                  </div>
                  {#if run.latestEventSummary}
                    <p class="mt-1 text-xs text-muted-foreground">{run.latestEventSummary}</p>
                  {/if}
                </div>
              {/each}
            </div>
            <ul class="space-y-1">
              {#each displayedRunFeedback.events as event (event.id)}
                <li data-task-run-feedback-event class="text-xs text-muted-foreground">
                  <span class="text-foreground">{event.summary}</span>{event.output ? ` - ${event.output}` : ""}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </section>

      <!-- Activity feed -->
      {#if payload.events.length > 0}
        <section data-task-activity class="mb-6">
          <h2 class="text-sm font-semibold text-muted-foreground mb-2">Activity ({payload.events.length})</h2>
          <ul class="space-y-2">
            {#each payload.events as event (event.id)}
              <li data-activity-item class="text-sm text-muted-foreground">
                <span class="font-medium text-foreground">{event.actor}</span>
                {event.verb}
                <span class="text-xs">{event.created_at}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Status/Priority overlay (triggered by keyboard shortcuts) -->
      {#if activeOverlay === "status"}
        <div data-overlay-status class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onclick={() => (activeOverlay = null)} role="presentation">
          <div class="bg-background rounded-lg border border-border p-4 shadow-lg" onclick={(event) => event.stopPropagation()} role="presentation">
            <h3 class="text-sm font-semibold mb-2">Set status</h3>
            {#each TASK_STATUSES as s (s)}
              <button
                type="button"
                class="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded"
                onclick={() => { postForm("update", { status: s }); activeOverlay = null; }}
              >{describeStatus(s)}</button>
            {/each}
          </div>
        </div>
      {/if}

      {#if activeOverlay === "priority"}
        <div data-overlay-priority class="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onclick={() => (activeOverlay = null)} role="presentation">
          <div class="bg-background rounded-lg border border-border p-4 shadow-lg" onclick={(event) => event.stopPropagation()} role="presentation">
            <h3 class="text-sm font-semibold mb-2">Set priority</h3>
            {#each [0,1,2,3,4,5] as p (p)}
              <button
                type="button"
                class="block w-full text-left px-3 py-1.5 text-sm hover:bg-muted rounded"
                onclick={() => { postForm("update", { priority: String(p) }); activeOverlay = null; }}
              >P{p}</button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <footer class="flex items-center gap-2 border-t border-border pt-4">
        <button type="button" data-task-save onclick={onSave} class={cn(buttonVariants({ variant: "default" }))}>Save</button>
        <button type="button" data-task-delete onclick={onDelete} class={cn(buttonVariants({ variant: "destructive" }))}>Delete</button>
      </footer>
    </article>
  {/if}
{/await}
