<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { browser } from "$app/environment";
  import type { PageData } from "./$types";
  import RunStatusBadge from "$lib/components/runs/RunStatusBadge.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { formatDuration } from "$lib/util/duration";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  type Tab = "review" | "transcript" | "diff" | "artifacts" | "advanced" | "payload" | "events";
  let tab = $state<Tab>("review");
  let showCancel = $state(false);
  let showRetry = $state(false);
  let autoScroll = $state(true);
  let timelineElement = $state<HTMLDivElement | null>(null);

  function selectTab(next: Tab): void {
    tab = next;
  }

  // Collapsible JSONL turn state
  let expandedTurns = $state<Set<number>>(new Set());

  function toggleTurn(index: number): void {
    const next = new Set(expandedTurns);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    expandedTurns = next;
  }

  function artifactSizeLabel(size: number | null): string {
    return size !== null ? `${size} bytes` : "unknown size";
  }

  function retentionLabel(artifact: { archived: boolean; retention_until: string | null }): string {
    if (artifact.archived) return "Archived";
    return artifact.retention_until ? `Retains until ${artifact.retention_until}` : "Retention: keep";
  }

  function sourceLabel(value: string | null): string {
    return value ?? "none";
  }

  type RunEventLike = {
    id: string;
    verb: string;
    created_at: string | Date;
    actor?: string;
    payload: Record<string, unknown>;
  };

  type LogEntryLike = { timestamp?: string; stream: string; text: string };

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

  type DiffLine = {
    key: string;
    kind: "file" | "hunk" | "add" | "delete" | "context";
    oldLine: number | null;
    newLine: number | null;
    text: string;
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

  function buildLiveSessionItems(
    events: RunEventLike[],
    entries: LogEntryLike[] | null,
    transcript: string | null,
  ): LiveSessionItem[] {
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

    const logItems = (entries ?? []).slice(-12).map((entry, index) => ({
      id: `log-${index}`,
      kind: "message" as const,
      title: entry.stream,
      timestamp: entry.timestamp ?? "live",
      summary: entry.text,
      argsSummary: null,
      resultStatus: null,
      copyText: entry.text,
    }));
    if (logItems.length > 0) return logItems;

    return (transcript ?? "")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-12)
      .map((line, index) => ({
        id: `transcript-${index}`,
        kind: "message",
        title: "Transcript",
        timestamp: "recorded",
        summary: line,
        argsSummary: null,
        resultStatus: null,
        copyText: line,
      }));
  }

  function diffFiles(diff: string | null): string[] {
    if (!diff) return [];
    return diff
      .split(/\r?\n/)
      .filter((line) => line.startsWith("diff --git "))
      .map((line) => line.replace(/^diff --git a\//, "").replace(/ b\/.*$/, ""))
      .filter(Boolean);
  }

  function diffLines(diff: string | null): DiffLine[] {
    if (!diff) return [];
    let oldLine: number | null = null;
    let newLine: number | null = null;
    return diff.split(/\r?\n/).map((text, index) => {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
      if (text.startsWith("diff --git ")) {
        oldLine = null;
        newLine = null;
        return { key: `${index}:file`, kind: "file", oldLine: null, newLine: null, text };
      }
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        return { key: `${index}:hunk`, kind: "hunk", oldLine: null, newLine: null, text };
      }
      if (text.startsWith("+") && !text.startsWith("+++")) {
        const line = { key: `${index}:add`, kind: "add" as const, oldLine: null, newLine, text };
        if (newLine !== null) newLine += 1;
        return line;
      }
      if (text.startsWith("-") && !text.startsWith("---")) {
        const line = { key: `${index}:delete`, kind: "delete" as const, oldLine, newLine: null, text };
        if (oldLine !== null) oldLine += 1;
        return line;
      }
      const line = { key: `${index}:context`, kind: "context" as const, oldLine, newLine, text };
      if (oldLine !== null && newLine !== null && !text.startsWith("+++") && !text.startsWith("---")) {
        oldLine += 1;
        newLine += 1;
      }
      return line;
    });
  }

  async function copyText(value: string): Promise<void> {
    if (!browser || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
  }

  // 2s polling while client-side (fallback when SSE not available)
  $effect(() => {
    if (!browser) return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 2000);
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
  {@const logs = payload.logs}
  {@const diff = payload.diff}
  {@const artifacts = payload.artifacts}
  {@const events = payload.events}
  {@const observability = payload.observability}
  {@const liveSessionItems = buildLiveSessionItems(events, logs?.entries ?? null, transcript)}
  {@const changedFiles = diffFiles(diff)}
  {@const renderedDiffLines = diffLines(diff)}
  <header
    data-runs-detail-header
    class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
  >
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/runs" data-back-runs class={cn("text-sm text-muted-foreground hover:underline")}>← Runs</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{run.agent}</h1>
      <RunStatusBadge status={run.status} />
    </div>
    <span class={cn("text-xs text-muted-foreground font-mono")}
      >{formatDuration(run.started_at, run.ended_at)}</span
    >
  </header>

  <section data-run-workflow-summary class={cn("mb-4 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-4")}>
    <div>
      <h2 class={cn("text-sm font-semibold")}>Live state</h2>
      <p data-run-live-state class={cn("mt-1 text-xs text-muted-foreground")}>Status {run.status} · elapsed {formatDuration(run.started_at, run.ended_at)}</p>
    </div>
    <div>
      <h2 class={cn("text-sm font-semibold")}>Workflow</h2>
      <p data-run-workflow-link class={cn("mt-1 text-xs text-muted-foreground")}>
        {#if run.project_id}
          <a href="/projects/{run.project_id}/runs" class={cn("text-primary hover:underline")}>Project runs</a>
        {:else}
          Project none
        {/if}
      </p>
    </div>
    <div>
      <h2 class={cn("text-sm font-semibold")}>Context</h2>
      <p data-run-context-source-count class={cn("mt-1 text-xs text-muted-foreground")}>{observability.context.sourceRefs.length} source refs</p>
    </div>
    <div>
      <h2 class={cn("text-sm font-semibold")}>Trace</h2>
      <p data-run-trace-link class={cn("mt-1 text-xs font-mono text-muted-foreground")}>{run.id}</p>
    </div>
  </section>

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

  <section data-ai-assist-live-session class={cn("mb-4 rounded-md border border-border bg-background")}>
    <div class={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2")}>
      <div>
        <h2 class={cn("text-sm font-semibold")}>AI Assist live session</h2>
        <p class={cn("text-xs text-muted-foreground")}>Transcript, tool calls, diffs, approvals, artifacts, and stream recovery.</p>
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
    <div data-live-file-diff-pane class={cn("border-t border-border p-3")}>
      <div class={cn("mb-2 flex flex-wrap items-center justify-between gap-2")}>
        <div>
          <h3 class={cn("text-sm font-semibold")}>File changes</h3>
          <p data-file-scope-validation class={cn("text-xs text-muted-foreground")}>
            {changedFiles.length} changed {changedFiles.length === 1 ? "file" : "files"} · deletions marked · scope validated before unsafe writes
          </p>
        </div>
        {#if changedFiles.length > 0}
          <div data-file-scope-list class={cn("flex flex-wrap gap-1")}>
            {#each changedFiles as file}
              <code class={cn("rounded bg-muted px-1.5 py-0.5 text-[11px]")}>{file}</code>
            {/each}
          </div>
        {/if}
      </div>
      {#if renderedDiffLines.length > 0}
        <ol data-live-unified-diff class={cn("max-h-[34vh] overflow-auto rounded-md border border-border bg-muted/20 font-mono text-[11px]")}>
          {#each renderedDiffLines as line (line.key)}
            <li
              data-diff-line={line.kind}
              class={cn(
                "grid grid-cols-[4rem_4rem_minmax(0,1fr)] gap-2 px-2 py-0.5",
                line.kind === "add" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                line.kind === "delete" && "bg-destructive/10 text-destructive",
                line.kind === "hunk" && "bg-primary/10 text-primary",
                line.kind === "file" && "bg-muted text-foreground font-semibold",
              )}
            >
              <span data-diff-old-line class={cn("select-none text-right text-muted-foreground")}>{line.oldLine ?? ""}</span>
              <span data-diff-new-line class={cn("select-none text-right text-muted-foreground")}>{line.newLine ?? ""}</span>
              <code class={cn("min-w-0 whitespace-pre-wrap break-words")}>{line.text}</code>
            </li>
          {/each}
        </ol>
      {:else}
        <div data-live-unified-diff-empty class={cn("rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground")}>No file changes recorded yet.</div>
      {/if}
    </div>
  </section>

  <div data-runs-tabs role="tablist" class={cn("mb-2 flex items-center gap-2 border-b border-border")}>
    <button type="button" role="tab" data-tab="review" data-active={tab === "review"} onclick={() => selectTab("review")} class={cn("h-9 px-3 text-sm", tab === "review" && "font-semibold border-b-2 border-primary")}>Review</button>
    <button type="button" role="tab" data-tab="transcript" data-active={tab === "transcript"} onclick={() => selectTab("transcript")} class={cn("h-9 px-3 text-sm", tab === "transcript" && "font-semibold border-b-2 border-primary")}>Transcript</button>
    <button type="button" role="tab" data-tab="diff" data-active={tab === "diff"} onclick={() => selectTab("diff")} class={cn("h-9 px-3 text-sm", tab === "diff" && "font-semibold border-b-2 border-primary")}>Diff</button>
    <button type="button" role="tab" data-tab="artifacts" data-active={tab === "artifacts"} onclick={() => selectTab("artifacts")} class={cn("h-9 px-3 text-sm", tab === "artifacts" && "font-semibold border-b-2 border-primary")}>Artifacts</button>
    <button type="button" role="tab" data-tab="advanced" data-active={tab === "advanced"} onclick={() => selectTab("advanced")} class={cn("h-9 px-3 text-sm", tab === "advanced" && "font-semibold border-b-2 border-primary")}>Advanced trace</button>
    <button type="button" role="tab" data-tab="payload" data-active={tab === "payload"} onclick={() => selectTab("payload")} class={cn("h-9 px-3 text-sm", tab === "payload" && "font-semibold border-b-2 border-primary")}>Payload</button>
    <button type="button" role="tab" data-tab="events" data-active={tab === "events"} onclick={() => selectTab("events")} class={cn("h-9 px-3 text-sm", tab === "events" && "font-semibold border-b-2 border-primary")}>Events</button>
  </div>

  <div role="tabpanel" data-runs-tabpanel="review" hidden={tab !== "review"}>
    <section data-runs-review class={cn("grid gap-3 md:grid-cols-2")}>
      <div class={cn("rounded-md border border-border p-3")}>
        <h2 class={cn("text-sm font-semibold")}>Context</h2>
        <p class={cn("mt-1 text-xs text-muted-foreground")}>{observability.context.sourceRefs.length} source refs</p>
      </div>
      <div class={cn("rounded-md border border-border p-3")}>
        <h2 class={cn("text-sm font-semibold")}>Artifacts</h2>
        <p class={cn("mt-1 text-xs text-muted-foreground")}>{observability.artifacts.length} produced artifacts</p>
      </div>
      <div class={cn("rounded-md border border-border p-3")}>
        <h2 class={cn("text-sm font-semibold")}>Memory</h2>
        <p class={cn("mt-1 text-xs text-muted-foreground")}>{observability.memoryCandidates.length} candidates</p>
      </div>
      <div class={cn("rounded-md border border-border p-3")}>
        <h2 class={cn("text-sm font-semibold")}>Recovery</h2>
        <p data-runs-retry-schedule class={cn("mt-1 text-xs text-muted-foreground")}>
          Attempt {observability.recovery.retryCount}
          {#if observability.recovery.nextRetryAt}
            · {observability.recovery.nextRetryAt}
          {/if}
          {#if observability.recovery.lastErrorKind}
            · {observability.recovery.lastErrorKind}
          {/if}
        </p>
      </div>
    </section>
  </div>

  <!-- Transcript tab: collapsible JSONL turns -->
  <div role="tabpanel" data-runs-tabpanel="transcript" hidden={tab !== "transcript"}>
    {#if logs !== null && logs.entries.length > 0}
      <ul data-runs-transcript class={cn("max-h-[60vh] overflow-auto space-y-1")}>
        {#each logs.entries as entry, i (i)}
          <li class={cn("rounded-md border border-border bg-muted/30")}>
            <button
              type="button"
              data-transcript-turn={i}
              onclick={() => toggleTurn(i)}
              class={cn("flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50")}
            >
              <span class={cn("flex items-center gap-2")}>
                <span class={cn("font-mono text-muted-foreground")}>{entry.timestamp || "-"}</span>
                <span class={cn("rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase")}>{entry.stream}</span>
              </span>
              <span class={cn("text-muted-foreground")}>{expandedTurns.has(i) ? "▼" : "▶"}</span>
            </button>
            {#if expandedTurns.has(i)}
              <pre class={cn("px-3 pb-2 text-xs whitespace-pre-wrap")}>{entry.text}</pre>
            {/if}
          </li>
        {/each}
      </ul>
      {#if logs.cursor !== null}
        <div class={cn("mt-2 text-xs text-muted-foreground")}>More entries available (paginated)</div>
      {/if}
    {:else if transcript !== null}
      <pre data-runs-transcript class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{transcript}</pre>
    {:else}
      <div data-runs-transcript-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No transcript recorded</div>
    {/if}
  </div>

  <!-- Diff tab: syntax-highlighted diff -->
  <div role="tabpanel" data-runs-tabpanel="diff" hidden={tab !== "diff"}>
    {#if diff}
      <pre data-runs-diff class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-mono")}>{diff}</pre>
    {:else}
      <div data-runs-diff-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No workspace diff recorded</div>
    {/if}
  </div>

  <!-- Artifacts tab: generated files, retention, provenance, and actions -->
  <div role="tabpanel" data-runs-tabpanel="artifacts" hidden={tab !== "artifacts"}>
    {#if artifacts.length > 0}
      <ul data-runs-artifacts class={cn("space-y-3")}>
        {#each artifacts as artifact (artifact.id)}
          <li class={cn("grid gap-3 rounded-md border border-border p-3 text-sm md:grid-cols-[1fr_auto]")}>
            <div class={cn("min-w-0 space-y-2")}>
              <div class={cn("flex flex-wrap items-center gap-2")}>
                <span class={cn("font-medium")}>{artifact.title}</span>
                <span class={cn("rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground")}>{artifact.kind}</span>
                <span data-runs-artifact-preview={artifact.id} class={cn("rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground")}>{artifact.preview_kind} preview</span>
              </div>
              <div class={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground")}>
                <span>{artifact.mime ?? "unknown"}</span>
                <span>{artifactSizeLabel(artifact.size)}</span>
                <span data-runs-artifact-retention={artifact.id}>{retentionLabel(artifact)}</span>
                <span>Lifecycle: {artifact.lifecycle_state}</span>
              </div>
              <div class={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs")}>
                <a href="/runs/{artifact.run_id ?? run.id}" class={cn("text-primary hover:underline")}>Run {sourceLabel(artifact.run_id ?? run.id)}</a>
                {#if artifact.project_id}
                  <a href="/projects/{artifact.project_id}" class={cn("text-primary hover:underline")}>Project {artifact.project_id}</a>
                {:else}
                  <span class={cn("text-muted-foreground")}>Project none</span>
                {/if}
                {#if artifact.task_id}
                  <a href="/tasks/{artifact.task_id}" class={cn("text-primary hover:underline")}>Task {artifact.task_id}</a>
                {:else}
                  <span class={cn("text-muted-foreground")}>Task none</span>
                {/if}
                <span class={cn("text-muted-foreground")}>Doc {sourceLabel(artifact.linked_doc_id ?? artifact.doc_id)}</span>
                {#if artifact.promoted_to_memory}
                  <span class={cn("text-muted-foreground")}>Memory promoted</span>
                {/if}
              </div>
            </div>
            <div class={cn("flex flex-wrap items-center gap-2 md:justify-end")}>
              {#if artifact.body_path}
                <a
                  href="/api/artifacts/{artifact.id}/download"
                  data-artifact-download={artifact.id}
                  class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}
                >Download</a>
              {/if}
              <form method="POST" action="?/archiveArtifact" use:enhance>
                <input type="hidden" name="artifactId" value={artifact.id} />
                <button type="submit" data-runs-artifact-archive={artifact.id} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}>Archive</button>
              </form>
              <form method="POST" action="?/linkArtifactToDoc" use:enhance class={cn("flex items-center gap-1")}>
                <input type="hidden" name="artifactId" value={artifact.id} />
                <input name="docId" value={artifact.linked_doc_id ?? artifact.doc_id ?? ""} aria-label="Document id" data-runs-artifact-doc-link={artifact.id} class={cn("h-8 w-36 rounded-md border border-input bg-background px-2 text-xs")} />
                <button type="submit" class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}>Link doc</button>
              </form>
              <form method="POST" action="?/promoteArtifactToMemory" use:enhance>
                <input type="hidden" name="artifactId" value={artifact.id} />
                <button type="submit" data-runs-artifact-promote-memory={artifact.id} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}>Promote memory</button>
              </form>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div data-runs-artifacts-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No artifacts recorded</div>
    {/if}
  </div>

  <div role="tabpanel" data-runs-tabpanel="payload" hidden={tab !== "payload"}>
    <pre data-runs-payload class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{JSON.stringify(run, null, 2)}</pre>
  </div>

  <div role="tabpanel" data-runs-tabpanel="advanced" hidden={tab !== "advanced"}>
    <pre data-runs-advanced-trace class={cn("max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{JSON.stringify(observability, null, 2)}</pre>
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
