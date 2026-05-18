<script lang="ts">
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";
  import type { SessionWorkbenchModel } from "@agent-client-protocol/interface/session-workbench.ts";

  interface Props {
    model: SessionWorkbenchModel;
  }

  let { model }: Props = $props();

  const statusLabel: Record<string, string> = {
    idle: "Idle",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    connected: "Connected",
    error: "Error",
  };

  const hasSavedSessions = model.resumableSessions.length > 0;
  const reconnectAgentName = $derived(model.connection.reconnect.agentName ?? "agent");
  const showReconnectBanner = $derived(model.connection.status === "reconnecting" || model.controls.canReconnect || model.connection.error !== null);
  let transcriptEl: HTMLDivElement | undefined = $state();
  let reconnectFormEl: HTMLFormElement | undefined = $state();
  let autoscrollLocked = $state(false);
  let copiedMessageId = $state<string | null>(null);
  let errorDismissed = $state(false);
  let abortConfirmOpen = $state(false);
  const messageCount = $derived(model.messages.length);
  const hasMutatingToolCalls = $derived(model.toolCalls.items.some((toolCall) => toolCall.status === "pending" || toolCall.status === "in_progress"));

  $effect(() => {
    messageCount;
    if (!autoscrollLocked) {
      transcriptEl?.scrollTo({ top: transcriptEl.scrollHeight });
    }
  });

  $effect(() => {
    model.connection.error;
    errorDismissed = false;
  });

  $effect(() => {
    if (!model.controls.canReconnect || model.connection.reconnect.exhausted || typeof window === "undefined") return;
    const requestReconnect = () => {
      if (document.visibilityState === "hidden") return;
      reconnectFormEl?.requestSubmit();
    };
    window.addEventListener("online", requestReconnect);
    document.addEventListener("visibilitychange", requestReconnect);
    return () => {
      window.removeEventListener("online", requestReconnect);
      document.removeEventListener("visibilitychange", requestReconnect);
    };
  });

  function updateAutoscrollLock(): void {
    if (!transcriptEl) return;
    const distanceFromBottom = transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight;
    autoscrollLocked = distanceFromBottom > 48;
  }

  function resumeAutoscroll(): void {
    autoscrollLocked = false;
    transcriptEl?.scrollTo({ top: transcriptEl.scrollHeight, behavior: "smooth" });
  }

  async function copyMessage(messageId: string, content: string): Promise<void> {
    await navigator.clipboard?.writeText(content);
    copiedMessageId = messageId;
    setTimeout(() => {
      if (copiedMessageId === messageId) copiedMessageId = null;
    }, 1600);
  }

  function formatMessageTime(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderInlineMarkdown(value: string): string {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
  }

  function renderMessageMarkdown(value: string): string {
    const blocks: string[] = [];
    const lines = value.split("\n");
    let paragraph: string[] = [];
    let code: string[] | null = null;

    function flushParagraph(): void {
      if (paragraph.length === 0) return;
      blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    for (const line of lines) {
      if (line.startsWith("```")) {
        if (code) {
          blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
          code = null;
        } else {
          flushParagraph();
          code = [];
        }
        continue;
      }
      if (code) {
        code.push(line);
        continue;
      }
      if (!line.trim()) {
        flushParagraph();
        continue;
      }
      if (line.startsWith("- ")) {
        flushParagraph();
        blocks.push(`<ul><li>${renderInlineMarkdown(line.slice(2))}</li></ul>`);
        continue;
      }
      if (line.startsWith("|")) {
        flushParagraph();
        blocks.push(`<pre><code>${escapeHtml(line)}</code></pre>`);
        continue;
      }
      paragraph.push(line);
    }

    flushParagraph();
    if (code) blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    return blocks.join("");
  }

  function diffLineClass(kind: string): string {
    if (kind === "add") return "bg-emerald-500/10 text-emerald-950 dark:text-emerald-100";
    if (kind === "remove") return "bg-rose-500/10 text-rose-950 dark:text-rose-100";
    return "text-muted-foreground";
  }

  function diffPrefix(kind: string): string {
    if (kind === "add") return "+";
    if (kind === "remove") return "-";
    return " ";
  }

  function permissionOptionClass(optionId: string, kind: string): string {
    const normalized = `${optionId} ${kind}`.toLowerCase();
    if (normalized.includes("deny") || normalized.includes("cancel")) {
      return "option-deny border-rose-500/60 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300";
    }
    if (normalized.includes("always")) {
      return "option-allow-always border-emerald-500/60 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300";
    }
    return "option-allow-once border-emerald-500/60 bg-emerald-600 text-white hover:bg-emerald-700";
  }

  function requestAbort(): void {
    if (hasMutatingToolCalls) {
      abortConfirmOpen = true;
      return;
    }
    document.querySelector<HTMLFormElement>("[data-abort-session-form]")?.requestSubmit();
  }
</script>

<section
  data-agent-session-workbench
  data-session-workbench
  data-session-status={model.connection.status}
  class={cn("rounded-lg border border-border bg-background p-4")}
>
  <header class={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3")}>
    <div>
      <h2 class={cn("text-base font-semibold")}>Session workbench</h2>
      {#if model.session}
        <p data-session-title class={cn("mt-1 text-sm text-muted-foreground")}>{model.session.title}</p>
      {:else}
        <p data-session-empty class={cn("mt-1 text-sm text-muted-foreground")}>
          {hasSavedSessions ? "No active session" : "No saved sessions yet."}
        </p>
      {/if}
    </div>
    <span data-session-status-label class={cn("rounded-md border border-border px-2 py-1 text-xs")}>
      {statusLabel[model.connection.status] ?? model.connection.status}
    </span>
  </header>

  {#if model.connection.error && !errorDismissed}
    <p data-session-error class={cn("mt-3 text-sm text-destructive")}>{model.connection.error}</p>
  {/if}

  {#if showReconnectBanner}
    <section
      data-reconnect-banner
      data-reconnect-exhausted={model.connection.reconnect.exhausted}
      class={cn(
        "manual-reconnect-btn mt-3 flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        model.connection.status === "reconnecting" ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-muted/30",
      )}
    >
      <div class={cn("min-w-0")}>
        <div class={cn("flex items-center gap-2 font-medium")}>
          {#if model.connection.status === "reconnecting"}
            <span data-reconnect-spinner class={cn("h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent")} aria-hidden="true"></span>
            <span>Reconnecting...</span>
          {:else if model.connection.reconnect.exhausted}
            <span>Reconnect needed</span>
          {:else}
            <span>Connection interrupted</span>
          {/if}
        </div>
        <p class={cn("mt-1 text-xs text-muted-foreground")}>
          {#if model.connection.status === "reconnecting"}
            Restoring {reconnectAgentName} without reloading this page.
          {:else if model.connection.reconnect.exhausted}
            Automatic retry stopped. Check the agent process, then reconnect to {reconnectAgentName}.
          {:else}
            AI Assist will retry when this app is active. You can reconnect to {reconnectAgentName} now.
          {/if}
        </p>
      </div>
      <div class={cn("flex flex-wrap items-center gap-2")}>
        <form bind:this={reconnectFormEl} method="POST" action="?/reconnectSession" data-reconnect-form>
          <button
            type="submit"
            data-manual-reconnect
            disabled={!model.controls.canReconnect || model.connection.status === "reconnecting"}
            class={cn(buttonVariants({ variant: "default", size: "sm" }), "manual-reconnect-btn")}
          >
            Reconnect {reconnectAgentName}
          </button>
        </form>
        {#if model.connection.error && !errorDismissed}
          <button type="button" data-dismiss-error class={cn(buttonVariants({ variant: "ghost", size: "sm" }), "dismiss-error-btn")} onclick={() => (errorDismissed = true)}>
            Dismiss
          </button>
        {/if}
      </div>
    </section>
  {/if}

  {#if !model.session && !hasSavedSessions}
    <div data-session-empty-state class={cn("mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 py-6 text-center")}>
      <div>
        <h3 class={cn("text-sm font-semibold")}>No saved sessions yet.</h3>
        <p class={cn("mt-1 text-sm text-muted-foreground")}>Create a new session to Begin.</p>
      </div>
      <a href="#agent-connect-form" class={cn(buttonVariants({ variant: "default", size: "sm" }), "empty-create-btn")}>
        Create Session
      </a>
    </div>
  {/if}

  {#if model.connection.status === "idle"}
    <form id="agent-connect-form" method="POST" action="?/connectBridge" data-connect-bridge class={cn("mt-4 grid gap-3 rounded-md border border-border p-3")}>
      <h3 class={cn("text-sm font-medium")}>Connect to agent</h3>
      <div class={cn("grid grid-cols-2 gap-2")}>
        <input name="agentName" placeholder="Agent name" required class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")} />
        <select name="transportType" class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")}>
          <option value="stdio">stdio (local)</option>
          <option value="websocket">WebSocket (remote)</option>
        </select>
      </div>
      <input name="command" placeholder="Command (for stdio)" class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")} />
      <input name="url" placeholder="URL (for websocket)" class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")} />
      <input name="cwd" placeholder="Working directory" class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")} />
      <button type="submit" class={cn(buttonVariants({ variant: "default", size: "sm" }), "w-fit")}>Connect</button>
    </form>
  {/if}

  <div data-session-controls class={cn("mt-4 flex flex-wrap gap-2")}>
    <button type="button" disabled={!model.controls.canPrompt} class={cn(buttonVariants({ variant: "default", size: "sm" }))}>
      Prompt
    </button>
    <button type="button" disabled={!model.controls.canCancel} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      Cancel
    </button>
    <button type="button" disabled={!model.controls.canDisconnect} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      Disconnect
    </button>
    <button type="button" disabled={!model.controls.canAbort} onclick={requestAbort} class={cn(buttonVariants({ variant: "destructive", size: "sm" }), "abort-btn")}>
      Abort
    </button>
    {#if model.controls.canPauseSession}
      <form method="POST" action="?/pauseSession">
        <button type="submit" class={cn(buttonVariants({ variant: "outline", size: "sm" }), "pause-btn border-amber-500/60 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300")}>
          Pause
        </button>
      </form>
    {/if}
    {#if model.controls.canResumeSession}
      <form method="POST" action="?/resumeSession">
        <button type="submit" class={cn(buttonVariants({ variant: "default", size: "sm" }), "resume-btn")}>
          Resume
        </button>
      </form>
    {/if}
  </div>

  <form method="POST" action="?/abortSession" data-abort-session-form class={cn("hidden")}></form>

  {#if model.connection.paused}
    <div data-session-paused class={cn("mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm")}>
      AI Assist is paused. Resume when you want the agent to continue.
    </div>
  {/if}

  {#if abortConfirmOpen}
    <div data-abort-confirmation class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4")}>
      <div role="dialog" aria-modal="true" aria-labelledby="abort-title" class={cn("w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-xl")}>
        <h3 id="abort-title" class={cn("text-base font-semibold")}>Abort active work?</h3>
        <p class={cn("mt-2 text-sm text-muted-foreground")}>
          AI Assist has active tool calls. Aborting stops the session and may leave partial file changes for review.
        </p>
        <div class={cn("mt-4 flex justify-end gap-2")}>
          <button type="button" data-abort-cancel class={cn(buttonVariants({ variant: "outline", size: "sm" }))} onclick={() => (abortConfirmOpen = false)}>
            Keep running
          </button>
          <form method="POST" action="?/abortSession">
            <button type="submit" data-abort-confirm class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}>
              Abort session
            </button>
          </form>
        </div>
      </div>
    </div>
  {/if}

  <div class={cn("mt-4 grid gap-4 md:grid-cols-3")}>
    <div data-session-selectors class={cn("space-y-3")}>
      <div data-mode-selector>
        <h3 class={cn("text-sm font-medium")}>Modes</h3>
        {#if model.modes.length === 0}
          <p class={cn("text-xs text-muted-foreground")}>None</p>
        {:else}
          <div class={cn("mt-2 flex flex-wrap gap-1")}>
            {#each model.modes as mode}
              <span data-session-mode={mode.id} data-selected={mode.selected} class={cn("rounded-md border border-border px-2 py-1 text-xs")}>
                {mode.name}
              </span>
            {/each}
          </div>
        {/if}
      </div>
      <div data-model-picker>
        <h3 class={cn("text-sm font-medium")}>Models</h3>
        {#if model.models.length === 0}
          <p class={cn("text-xs text-muted-foreground")}>None</p>
        {:else}
          <div class={cn("mt-2 flex flex-wrap gap-1")}>
            {#each model.models as runtimeModel}
              <span data-session-model={runtimeModel.modelId} data-selected={runtimeModel.selected} class={cn("rounded-md border border-border px-2 py-1 text-xs")}>
                {runtimeModel.name}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div data-session-traffic data-traffic-monitor class={cn("space-y-2")}>
      <h3 class={cn("text-sm font-medium")}>Traffic</h3>
      <dl class={cn("grid grid-cols-2 gap-2 text-xs")}>
        <div><dt class={cn("text-muted-foreground")}>Total</dt><dd>{model.traffic.summary.total}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Requests</dt><dd>{model.traffic.summary.requests}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Responses</dt><dd>{model.traffic.summary.responses}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Notifications</dt><dd>{model.traffic.summary.notifications}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Errors</dt><dd>{model.traffic.summary.errors}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Paused</dt><dd>{model.traffic.paused ? "Yes" : "No"}</dd></div>
      </dl>
      <div class={cn("flex flex-wrap items-center gap-2")}>
        <form method="POST" action="?/trafficControl" class={cn("flex flex-wrap items-center gap-2")}>
          <input type="hidden" name="trafficAction" value="filter" />
          <select
            data-traffic-filter
            name="value"
            class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")}
          >
            <option value="all" selected={model.traffic.filter === "all"}>All</option>
            <option value="request" selected={model.traffic.filter === "request"}>Request</option>
            <option value="response" selected={model.traffic.filter === "response"}>Response</option>
            <option value="notification" selected={model.traffic.filter === "notification"}>Notification</option>
            <option value="error" selected={model.traffic.filter === "error"}>Error</option>
          </select>
        </form>
        <form method="POST" action="?/trafficControl" class={cn("flex items-center gap-2")}>
          <input type="hidden" name="trafficAction" value="search" />
          <input
            data-traffic-search
            name="value"
            type="text"
            placeholder="Search traffic..."
            value={model.traffic.searchQuery}
            class={cn("rounded-md border border-border bg-background px-2 py-1 text-xs")}
          />
        </form>
        <form method="POST" action="?/trafficControl">
          <input type="hidden" name="trafficAction" value="pause" />
          <input type="hidden" name="value" value={model.traffic.paused ? "resume" : "pause"} />
          <button
            data-traffic-pause
            type="submit"
            class={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
          >
            {model.traffic.paused ? "Resume" : "Pause"}
          </button>
        </form>
      </div>
      {#if model.traffic.filteredEntries.length > 0}
        <ol class={cn("space-y-1 text-xs")}>
          {#each model.traffic.filteredEntries.slice(0, 50) as entry}
            <li
              data-traffic-entry
              data-session-traffic-entry={entry.id}
              data-traffic-error={entry.error === true}
              class={cn("grid grid-cols-[auto_auto_1fr] gap-2 text-muted-foreground")}
            >
              <span>{entry.direction}</span>
              <span>{entry.type}</span>
              <span class={cn("truncate")}>{entry.method}</span>
            </li>
          {/each}
        </ol>
      {:else if model.traffic.entries.length > 0}
        <p data-session-traffic-empty-filter class={cn("text-xs text-muted-foreground")}>No matching traffic</p>
      {/if}
    </div>

    <div data-session-toolcalls class={cn("space-y-2")}>
      <h3 class={cn("text-sm font-medium")}>Tool calls</h3>
      <dl class={cn("grid grid-cols-2 gap-2 text-xs")}>
        <div><dt class={cn("text-muted-foreground")}>Total</dt><dd>{model.toolCalls.summary.total}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Active</dt><dd>{model.toolCalls.summary.pending + model.toolCalls.summary.inProgress}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Done</dt><dd>{model.toolCalls.summary.completed}</dd></div>
        <div><dt class={cn("text-muted-foreground")}>Failed</dt><dd>{model.toolCalls.summary.failed}</dd></div>
      </dl>
      {#if model.toolCalls.items.length > 0}
        <ol class={cn("space-y-3")}>
          {#each model.toolCalls.items as toolCall}
            <li data-session-toolcall={toolCall.toolCallId} class={cn("space-y-2 rounded-md border border-border p-2")}>
              <div class={cn("flex flex-wrap items-center justify-between gap-2 text-xs")}>
                <span class={cn("font-medium")}>{toolCall.title}</span>
                <span class={cn("rounded-md border border-border px-2 py-0.5 text-muted-foreground")}>{toolCall.status}</span>
              </div>
              {#if toolCall.diffs?.length}
                <div data-inline-diff-list class={cn("space-y-2")}>
                  {#each toolCall.diffs as diff}
                    <section
                      data-inline-diff={diff.id}
                      data-syntax-highlight
                      data-syntax-language={diff.language}
                      class={cn("overflow-hidden rounded-md border border-border")}
                    >
                      <header class={cn("flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1 text-xs")}>
                        <div class={cn("flex min-w-0 items-center gap-2")}>
                          <span class={cn("truncate font-medium")}>{diff.filePath}</span>
                          <span class={cn("rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground")}>{diff.language}</span>
                          {#if diff.status === "accepted"}
                            <span data-diff-accepted class={cn("rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300")}>Accepted</span>
                          {:else if diff.status === "rejected"}
                            <span data-diff-rejected class={cn("rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300")}>Rejected</span>
                          {/if}
                        </div>
                        <div class={cn("flex items-center gap-1")}>
                          <button type="button" class={cn(buttonVariants({ variant: "default", size: "sm" }), "diff-accept-btn h-7 px-2 text-xs")}>
                            Accept
                          </button>
                          <button type="button" class={cn(buttonVariants({ variant: "outline", size: "sm" }), "diff-reject-btn h-7 px-2 text-xs")}>
                            Reject
                          </button>
                        </div>
                      </header>
                      <div class={cn("overflow-x-auto")} data-inline-diff-scroll>
                        <div class={cn("min-w-[32rem] font-mono text-xs leading-5")} role="table" aria-label={`Unified diff for ${diff.filePath}`}>
                          {#each diff.lines as line}
                            <div data-diff-row={line.kind} class={cn("grid grid-cols-[3rem_3rem_2rem_1fr]", diffLineClass(line.kind))} role="row">
                              <span data-old-line class={cn("select-none border-r border-border px-2 text-right text-muted-foreground")} role="cell">
                                {line.oldLine ?? ""}
                              </span>
                              <span data-new-line class={cn("select-none border-r border-border px-2 text-right text-muted-foreground")} role="cell">
                                {line.newLine ?? ""}
                              </span>
                              <span class={cn("select-none px-2 text-muted-foreground")} role="cell">{diffPrefix(line.kind)}</span>
                              <code class={cn("whitespace-pre px-2")} role="cell">{line.content}</code>
                            </div>
                          {/each}
                        </div>
                      </div>
                      <label class={cn("block border-t border-border px-2 py-1 text-xs text-muted-foreground")}>
                        Reject reason (optional)
                        <textarea data-diff-reject-reason class={cn("mt-1 min-h-16 w-full rounded-md border border-border bg-background px-2 py-1 font-sans text-xs text-foreground")} placeholder="Tell agent what to change"></textarea>
                      </label>
                    </section>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  </div>

  {#if model.permission}
    <div data-session-permission data-permission-backdrop class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm")}>
      <div
        data-permission-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        class={cn("max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-xl")}
      >
        <div class={cn("space-y-2 border-b border-border pb-3")}>
          <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Permission required</p>
          <h3 id="permission-title" class={cn("text-base font-semibold")}>{model.permission.toolCall.title}</h3>
          <p class={cn("text-sm text-muted-foreground")}>
            AI Assist is requesting approval before running this {model.permission.toolCall.kind} action.
          </p>
        </div>

        <dl class={cn("mt-3 grid gap-2 text-sm")}>
          <div class={cn("grid grid-cols-[7rem_1fr] gap-2")}>
            <dt class={cn("text-muted-foreground")}>Tool kind</dt>
            <dd data-permission-tool-kind>{model.permission.toolCall.kind}</dd>
          </div>
          <div class={cn("grid grid-cols-[7rem_1fr] gap-2")}>
            <dt class={cn("text-muted-foreground")}>Session</dt>
            <dd class={cn("truncate")}>{model.permission.sessionId}</dd>
          </div>
        </dl>

        {#if model.permission.toolCall.locations?.length}
          <div data-permission-paths class={cn("mt-3 rounded-md border border-border p-2")}>
            <h4 class={cn("text-xs font-medium text-muted-foreground")}>Affected files</h4>
            <ul class={cn("mt-1 space-y-1 text-xs")}>
              {#each model.permission.toolCall.locations as location}
                <li class={cn("truncate font-mono")}>{location.path}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <p data-permission-timeout-policy class={cn("mt-3 text-xs text-muted-foreground")}>
          No timeout. This waits for your decision and closes automatically if the session ends.
        </p>

        <div class={cn("mt-4 grid gap-2 sm:grid-cols-2")}>
          {#each model.permission.options as option}
            <form method="POST" action="?/resolvePermission">
              <input type="hidden" name="sessionId" value={model.permission.sessionId} />
              <input type="hidden" name="optionId" value={option.optionId} />
              <button
                type="submit"
                data-permission-option={option.optionId}
                class={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full justify-center", permissionOptionClass(option.optionId, option.kind))}
              >
                {option.name}
              </button>
            </form>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if model.resumableSessions.length > 0}
    <div data-session-resume data-session-list class={cn("mt-4 rounded-md border border-border p-3")}>
      <h3 class={cn("text-sm font-medium")}>Resumable sessions</h3>
      <ol class={cn("mt-2 space-y-2")}>
        {#each model.resumableSessions as session}
          <li data-resumable-session={session.id} class={cn("flex flex-wrap items-center justify-between gap-2 text-sm")}>
            <span>{session.title}</span>
            <button
              type="button"
              disabled={!model.controls.canResume}
              data-resume-session={session.id}
              class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Resume
            </button>
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  <div data-session-messages class={cn("mt-4 space-y-2")}>
    <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
      <h3 class={cn("text-sm font-medium")}>Messages</h3>
      {#if autoscrollLocked}
        <button type="button" class={cn(buttonVariants({ variant: "outline", size: "sm" }), "autoscroll-lock-btn text-xs")} onclick={resumeAutoscroll}>
          Resume autoscroll
        </button>
      {/if}
    </div>
    {#if model.messages.length === 0}
      <p data-session-messages-empty class={cn("text-sm text-muted-foreground")}>No messages</p>
    {:else}
      <ol
        bind:this={transcriptEl}
        onscroll={updateAutoscrollLock}
        data-session-transcript
        data-autoscroll-locked={autoscrollLocked}
        class={cn("max-h-[32rem] space-y-2 overflow-y-auto pr-1 pb-20")}
      >
        {#each model.messages as message}
          <li data-session-message={message.id} data-message-role={message.role} class={cn("message rounded-md border border-border p-2 text-sm", message.role === "user" ? "bg-muted/40" : "bg-background")}>
            <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
              <div class={cn("flex items-center gap-2")}>
                <span class={cn("font-medium capitalize")}>{message.role}</span>
                <time class={cn("text-xs text-muted-foreground")} datetime={formatMessageTime(message.timestamp)}>
                  {formatMessageTime(message.timestamp)}
                </time>
              </div>
              <button type="button" class={cn(buttonVariants({ variant: "ghost", size: "sm" }), "copy-btn h-7 px-2 text-xs")} onclick={() => copyMessage(message.id, message.content)}>
                {copiedMessageId === message.id ? "Copied" : "Copy"}
              </button>
            </div>
            <div data-message-markdown class={cn("mt-2 max-w-none text-sm [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2")}>
              {@html renderMessageMarkdown(message.content)}
            </div>
            {#if message.toolCalls?.length}
              <ol data-message-toolcalls class={cn("mt-2 space-y-1 border-l border-border pl-2 text-xs")}>
                {#each message.toolCalls as toolCall}
                  <li data-message-toolcall={toolCall.toolCallId} class={cn("flex items-center justify-between gap-2 text-muted-foreground")}>
                    <span>{toolCall.title}</span>
                    <span>{toolCall.status}</span>
                  </li>
                {/each}
              </ol>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>
