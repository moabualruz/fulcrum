<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { browser } from "$app/environment";
  import type { PageData } from "./$types";
  import RunStatusBadge from "$lib/components/runs/RunStatusBadge.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { SYMPHONY_COLORS, type SymphonyState } from "$lib/orchestration";
  import { formatDuration } from "$lib/util/duration";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  type Tab = "transcript" | "payload" | "events";
  let tab = $state<Tab>("transcript");
  let showCancel = $state(false);
  let showRetry = $state(false);
  let autoScroll = $state(true);
  let timelineElement = $state<HTMLDivElement | null>(null);

  function selectTab(next: Tab): void {
    tab = next;
  }

  type RunEventLike = {
    id: string;
    verb: string;
    created_at: string | Date;
    actor?: string;
    payload: Record<string, unknown>;
  };

  type LiveSessionItem = {
    id: string;
    kind: "message" | "tool" | "diff" | "approval" | "event";
    title: string;
    timestamp: string;
    summary: string;
    argsSummary: string | null;
    resultStatus: string | null;
    copyText: string;
  };

  function payloadString(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string" && value.trim().length > 0) return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
    }
    return null;
  }

  function payloadJson(payload: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (value === undefined || value === null) continue;
      return typeof value === "string" ? value : JSON.stringify(value);
    }
    return null;
  }

  function buildLiveSessionItems(events: RunEventLike[], transcript: string | null): LiveSessionItem[] {
    const eventItems = events.map((event) => {
      const payload = event.payload ?? {};
      const verb = event.verb.toLowerCase();
      const toolName = payloadString(payload, ["toolName", "tool_name", "tool", "name", "command"]);
      const argsSummary = payloadJson(payload, ["args", "arguments", "input", "commandArgs", "command_args"]);
      const resultStatus = payloadString(payload, ["status", "resultStatus", "result_status", "exitCode", "exit_code"]);
      const resultSummary = payloadJson(payload, ["result", "output", "stderr", "stdout", "message", "summary"]);
      const isTool = verb.includes("tool") || toolName !== null || argsSummary !== null;
      const isDiff = verb.includes("diff") || payloadString(payload, ["diff", "patch", "workspaceDiff", "workspace_diff"]) !== null;
      const isApproval = verb.includes("approval") || payloadString(payload, ["approval", "approvalStatus", "approval_status"]) !== null;
      const kind = isApproval ? "approval" : isDiff ? "diff" : isTool ? "tool" : "event";
      const title = kind === "tool"
        ? toolName ?? event.verb
        : kind === "approval"
          ? "Approval gate"
          : kind === "diff"
            ? "Diff preview"
            : event.verb;
      const summary = resultSummary ?? payloadString(payload, ["text", "content", "description"]) ?? event.verb;
      return {
        id: event.id,
        kind,
        title,
        timestamp: String(event.created_at),
        summary,
        argsSummary,
        resultStatus,
        copyText: JSON.stringify({ verb: event.verb, payload }, null, 2),
      };
    });

    if (eventItems.length > 0) return eventItems;

    return (transcript ?? "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-12)
      .map((line, index) => ({
        id: `transcript-${index}`,
        kind: "message",
        title: "Transcript",
        timestamp: "live",
        summary: line,
        argsSummary: null,
        resultStatus: null,
        copyText: line,
      }));
  }

  async function copyText(value: string): Promise<void> {
    if (!browser || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
  }

  // 5s polling
  $effect(() => {
    if (!browser) return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 5000);
    return () => clearInterval(handle);
  });

  $effect(() => {
    if (!browser || !autoScroll || timelineElement === null) return;
    timelineElement.scrollTop = timelineElement.scrollHeight;
  });
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  {@const run = payload.run}
  {@const transcript = payload.transcript}
  {@const events = payload.events}
  {@const approvalQueue = payload.approvalQueue}
  {@const liveSessionItems = buildLiveSessionItems(events, transcript)}
  <header
    data-project-run-detail-header
    class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
  >
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/projects/{data.projectId}/runs" data-back-project-runs class={cn("text-sm text-muted-foreground hover:underline")}>← Runs</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{run.agent}</h1>
      <RunStatusBadge status={run.status} />
      {#if run.symphony_state}
        {@const stateColor = SYMPHONY_COLORS[run.symphony_state as SymphonyState] ?? "bg-muted text-muted-foreground"}
        <span
          data-symphony-badge
          class={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", stateColor)}
        >{run.symphony_state}</span>
      {/if}
    </div>
    <span class={cn("text-xs text-muted-foreground font-mono")}>{formatDuration(run.started_at, run.ended_at)}</span>
  </header>

  <!-- Run metadata -->
  <section data-run-meta class={cn("mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground")}>
    {#if run.workspace_path}
      <span>Workspace: <code class={cn("font-mono")}>{run.workspace_path}</code></span>
    {/if}
    {#if run.last_error_kind}
      <span>Error: <code class={cn("font-mono text-destructive")}>{run.last_error_kind}</code></span>
    {/if}
    {#if run.retry_count > 0}
      <span>Retries: {run.retry_count}</span>
    {/if}
    {#if run.parent_run_id}
      <span>Parent: <a href="/runs/{run.parent_run_id}" class={cn("underline")}>{run.parent_run_id}</a></span>
    {/if}
  </section>

  <!-- Cancel / Retry actions -->
  <section class={cn("mb-4 flex items-center gap-2")}>
    <button
      type="button"
      data-runs-cancel-trigger
      data-state={showCancel ? "open" : "closed"}
      onclick={() => (showCancel = true)}
      class={cn("inline-flex h-9 items-center rounded-md border border-destructive/60 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20")}
    >Cancel run</button>
    <button
      type="button"
      data-runs-retry-trigger
      data-state={showRetry ? "open" : "closed"}
      onclick={() => (showRetry = true)}
      class={cn("inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent")}
    >Retry run</button>
  </section>

  {#if showCancel}
    <div data-runs-cancel-confirm class={cn("mb-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-background p-3 text-xs")}>
      <span class={cn("text-muted-foreground")}>Cancel this run? This cannot be undone.</span>
      <form method="POST" action="?/cancel" use:enhance class={cn("flex items-center gap-2")}>
        <button type="button" onclick={() => (showCancel = false)} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent")}>Back</button>
        <button type="submit" data-runs-cancel-submit class={cn("inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90")}>Cancel run</button>
      </form>
    </div>
  {/if}

  {#if showRetry}
    <div data-runs-retry-confirm class={cn("mb-3 flex items-center gap-2 rounded-md border border-border bg-background p-3 text-xs")}>
      <span class={cn("text-muted-foreground")}>Retry this run? Creates a new agent_runs row.</span>
      <form method="POST" action="?/retry" use:enhance class={cn("flex items-center gap-2")}>
        <button type="button" onclick={() => (showRetry = false)} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent")}>Back</button>
        <button type="submit" data-runs-retry-submit class={cn("inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90")}>Retry</button>
      </form>
    </div>
  {/if}

  <section data-approval-queue-pane class={cn("mb-4 rounded-md border border-border bg-background")}>
    <div class={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2")}>
      <div>
        <h2 class={cn("text-sm font-semibold")}>Approval Queue</h2>
        <p class={cn("text-xs text-muted-foreground")}>Risky tool calls wait here with context before execution.</p>
      </div>
      <span data-approval-queue-count class={cn("rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium")}>{approvalQueue.length} pending</span>
    </div>
    <div class={cn("divide-y divide-border")}>
      {#each approvalQueue as item (item.id)}
        <article data-approval-queue-item={item.id} class={cn("grid gap-3 p-3 text-xs lg:grid-cols-[minmax(0,1fr)_auto]")}>
          <div class={cn("min-w-0 space-y-2")}>
            <div class={cn("flex flex-wrap items-center gap-2")}>
              <span data-approval-tool-name class={cn("font-semibold")}>{item.toolName}</span>
              <span data-approval-risk-level class={cn("rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground")}>{item.riskLevel}</span>
              {#if item.timeoutAt}
                <span data-approval-timeout class={cn("font-mono text-[10px] text-muted-foreground")}>timeout {item.timeoutAt}</span>
              {/if}
            </div>
            <p data-approval-context class={cn("text-muted-foreground")}>{item.context}</p>
            <pre data-approval-arguments class={cn("max-h-24 overflow-auto rounded bg-muted/40 p-2 text-[11px] whitespace-pre-wrap")}>{item.argumentsSummary}</pre>
          </div>
          <form method="POST" action="?/approvalDecision" use:enhance class={cn("flex flex-wrap items-start gap-2 lg:justify-end")}>
            <input type="hidden" name="approvalId" value={item.id} />
            <button name="decision" value="approve" data-approval-approve class={cn("inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90")}>Approve</button>
            <button name="decision" value="deny" data-approval-deny class={cn("inline-flex h-8 items-center rounded-md border border-destructive/60 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20")}>Deny</button>
            <button name="decision" value="request_info" data-approval-request-info class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}>Request Info</button>
          </form>
        </article>
      {:else}
        <div data-approval-queue-empty class={cn("p-4 text-sm text-muted-foreground")}>No risky tool calls waiting for approval.</div>
      {/each}
    </div>
  </section>

  <section data-ai-assist-live-session class={cn("mb-4 rounded-md border border-border bg-background")}>
    <div class={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2")}>
      <div>
        <h2 class={cn("text-sm font-semibold")}>AI Assist live session</h2>
        <p class={cn("text-xs text-muted-foreground")}>Transcript, tool calls, diffs, approvals, and stream recovery.</p>
      </div>
      <label class={cn("inline-flex items-center gap-2 text-xs text-muted-foreground")}>
        <input
          type="checkbox"
          data-live-autoscroll-toggle
          bind:checked={autoScroll}
          class={cn("h-4 w-4 rounded border-border")}
        />
        Autoscroll
      </label>
    </div>
    <div data-live-session-disconnect class={cn("border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground")}>
      Stream reconnects through polling if live transport drops.
    </div>
    <div bind:this={timelineElement} data-tool-call-timeline class={cn("max-h-[42vh] overflow-auto p-3")}>
      <ol class={cn("space-y-2")}>
        {#each liveSessionItems as item (item.id)}
          <li
            data-live-session-item={item.kind}
            data-tool-call-card={item.kind === "tool" ? item.id : undefined}
            data-approval-gate={item.kind === "approval" ? item.id : undefined}
            data-diff-preview={item.kind === "diff" ? item.id : undefined}
            class={cn("rounded-md border border-border bg-muted/20 p-3 text-xs")}
          >
            <div class={cn("flex flex-wrap items-start justify-between gap-2")}>
              <div class={cn("min-w-0")}>
                <div class={cn("flex flex-wrap items-center gap-2")}>
                  <span class={cn("font-semibold")}>{item.title}</span>
                  <span class={cn("rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground")}>{item.kind}</span>
                  {#if item.resultStatus}
                    <span data-tool-result-status class={cn("rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground")}>{item.resultStatus}</span>
                  {/if}
                </div>
                <span class={cn("mt-1 block font-mono text-[10px] text-muted-foreground")}>{item.timestamp}</span>
              </div>
              <button
                type="button"
                data-tool-output-copy
                onclick={() => copyText(item.copyText)}
                class={cn("inline-flex h-7 items-center rounded-md border border-input bg-background px-2 text-[11px] font-medium hover:bg-accent")}
              >Copy</button>
            </div>
            {#if item.argsSummary}
              <pre data-tool-args-summary class={cn("mt-2 max-h-24 overflow-auto rounded bg-background p-2 text-[11px] whitespace-pre-wrap")}>{item.argsSummary}</pre>
            {/if}
            <pre class={cn("mt-2 max-h-32 overflow-auto text-[11px] whitespace-pre-wrap text-muted-foreground")}>{item.summary}</pre>
          </li>
        {:else}
          <li data-live-session-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No live session events recorded.</li>
        {/each}
      </ol>
    </div>
  </section>

  <!-- Tabs -->
  <div data-runs-tabs role="tablist" class={cn("mb-2 flex items-center gap-2 border-b border-border")}>
    <button type="button" role="tab" data-tab="transcript" data-active={tab === "transcript"} onclick={() => selectTab("transcript")} class={cn("h-9 px-3 text-sm", tab === "transcript" && "font-semibold border-b-2 border-primary")}>Transcript</button>
    <button type="button" role="tab" data-tab="payload" data-active={tab === "payload"} onclick={() => selectTab("payload")} class={cn("h-9 px-3 text-sm", tab === "payload" && "font-semibold border-b-2 border-primary")}>Payload</button>
    <button type="button" role="tab" data-tab="events" data-active={tab === "events"} onclick={() => selectTab("events")} class={cn("h-9 px-3 text-sm", tab === "events" && "font-semibold border-b-2 border-primary")}>Events</button>
  </div>

  <div role="tabpanel" data-runs-tabpanel="transcript" hidden={tab !== "transcript"}>
    {#if transcript !== null}
      <pre data-runs-transcript class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{transcript}</pre>
    {:else}
      <div data-runs-transcript-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No transcript recorded</div>
    {/if}
  </div>

  <div role="tabpanel" data-runs-tabpanel="payload" hidden={tab !== "payload"}>
    <pre data-runs-payload class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{JSON.stringify(run, null, 2)}</pre>
  </div>

  <div role="tabpanel" data-runs-tabpanel="events" hidden={tab !== "events"}>
    <ul data-runs-events class={cn("flex flex-col gap-2")}>
      {#each events as event (event.id)}
        <li class={cn("rounded-md border border-border bg-background p-3 text-xs")}>
          <div class={cn("flex items-center justify-between")}>
            <span class={cn("font-medium")}>{event.verb}</span>
            <span class={cn("text-muted-foreground font-mono")}>{event.created_at}</span>
          </div>
          {#if Object.keys(event.payload).length > 0}
            <pre class={cn("mt-1 text-muted-foreground")}>{JSON.stringify(event.payload)}</pre>
          {/if}
        </li>
      {:else}
        <li class={cn("text-xs text-muted-foreground")}>No events recorded.</li>
      {/each}
    </ul>
  </div>
{/await}
