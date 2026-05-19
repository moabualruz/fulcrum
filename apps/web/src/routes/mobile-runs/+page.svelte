<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Severity = "error" | "warn" | "info";
  type ProviderTestStatus = "idle" | "connected" | "failed";

  interface RelatedEvent {
    kind: "task" | "run" | "session" | "tool";
    id: string;
    label: string;
    href: string;
  }

  interface Breadcrumb {
    timestamp: string;
    severity: Severity;
    message: string;
  }

  interface ErrorEvent {
    id: string;
    timestamp: string;
    severity: Severity;
    message: string;
    stack: string;
    breadcrumbs: Breadcrumb[];
    related: RelatedEvent[];
    sourceHref: string;
  }

  interface ProviderConfig {
    id: string;
    name: string;
    baseUrl: string;
    timeoutMs: number;
    version: string;
    quotaRemaining: number;
  }

  const PROVIDER: ProviderConfig = {
    id: "claude",
    name: "Claude",
    baseUrl: "https://api.anthropic.com",
    timeoutMs: 5000,
    version: "2026-05 provider schema",
    quotaRemaining: 8241,
  };

  const ERRORS: ErrorEvent[] = [
    {
      id: "err_trace_dedupe",
      timestamp: "2026-05-19T08:14:22Z",
      severity: "error",
      message: "Dedupe trace-id propagation failed",
      stack: [
        "TraceError: trace-id mismatch on outbox flush",
        "  at OutboxConsumer.flush (services/workflow-coordination/outbox.ts:142:18)",
        "  at AcpSession.complete (services/agent-client-protocol/session.ts:88:12)",
        "  at async runFulcrumAgent (apps/server/src/runtime/dispatch.ts:204:7)",
      ].join("\n"),
      breadcrumbs: [
        { timestamp: "2026-05-19T08:14:20Z", severity: "info", message: "session.create acp-9f3" },
        { timestamp: "2026-05-19T08:14:21Z", severity: "info", message: "agent.spawn claude-code" },
        { timestamp: "2026-05-19T08:14:21Z", severity: "warn", message: "outbox lag 1200ms" },
        { timestamp: "2026-05-19T08:14:22Z", severity: "error", message: "trace-id missing on event" },
      ],
      related: [
        { kind: "run", id: "run_acp_9f3", label: "Run · acp_9f3", href: "/runs/acp_9f3" },
        { kind: "session", id: "ses_acp_9f3", label: "Session · acp_9f3", href: "/sessions/acp_9f3" },
        { kind: "task", id: "task_outbox", label: "Task · outbox-flush", href: "/tasks/task_outbox" },
        { kind: "tool", id: "tool_outbox_flush", label: "Tool · OutboxConsumer.flush", href: "/tools/outbox_flush" },
      ],
      sourceHref: "/runs/acp_9f3#err_trace_dedupe",
    },
    {
      id: "err_mcp_handshake",
      timestamp: "2026-05-19T07:58:11Z",
      severity: "error",
      message: "MCP server handshake timeout",
      stack: [
        "TimeoutError: handshake exceeded 5000ms",
        "  at McpClient.handshake (services/mcp-registry/src/client.ts:67:11)",
        "  at async probeServer (apps/cli/src/mcp.ts:118:5)",
      ].join("\n"),
      breadcrumbs: [
        { timestamp: "2026-05-19T07:58:06Z", severity: "info", message: "mcp.probe github-mcp" },
        { timestamp: "2026-05-19T07:58:10Z", severity: "warn", message: "handshake retry 1/2" },
        { timestamp: "2026-05-19T07:58:11Z", severity: "error", message: "handshake exceeded 5000ms" },
      ],
      related: [
        { kind: "run", id: "run_mcp_probe", label: "Run · mcp-probe", href: "/runs/run_mcp_probe" },
        { kind: "tool", id: "tool_mcp_handshake", label: "Tool · McpClient.handshake", href: "/tools/mcp_handshake" },
      ],
      sourceHref: "/operate-mcp#err_mcp_handshake",
    },
  ];

  let activeId = $state<string | null>(null);
  let copyState = $state<string | null>(null);
  let providerApiKey = $state("sk-fulcrum-valid-demo");
  let providerBaseUrl = $state(PROVIDER.baseUrl);
  let providerTimeoutMs = $state(PROVIDER.timeoutMs);
  let providerTestStatus = $state<ProviderTestStatus>("idle");
  let providerLatencyMs = $state<number | null>(null);
  let providerError = $state("");
  let providerSaved = $state(false);
  const active = $derived(ERRORS.find((event) => event.id === activeId) ?? null);
  const canSaveProvider = $derived(providerTestStatus === "connected");

  function openError(id: string): void {
    activeId = id;
    copyState = null;
  }

  function closeError(): void {
    activeId = null;
    copyState = null;
  }

  async function copyStack(): Promise<void> {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.stack);
      copyState = "copied";
    } catch {
      copyState = "failed";
    }
  }

  function testProvider(): void {
    providerSaved = false;
    const trimmedKey = providerApiKey.trim();
    if (trimmedKey.length < 12 || trimmedKey.toLowerCase().includes("invalid")) {
      providerTestStatus = "failed";
      providerLatencyMs = 91;
      providerError = "Provider rejected credentials before quota check.";
      return;
    }

    providerTestStatus = "connected";
    providerLatencyMs = 184;
    providerError = "";
  }

  function saveProvider(): void {
    if (!canSaveProvider) return;
    providerSaved = true;
  }
</script>

<svelte:head>
  <title>Mobile · Runs errors | Fulcrum</title>
</svelte:head>

<section data-mobile-runs class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1">
    <h1 data-mobile-runs-header class="text-2xl font-semibold tracking-tight">Run errors</h1>
    <p class="text-sm text-muted-foreground">
      Tap a failed event to inspect its stack, breadcrumbs, and related run/session/task/tool context.
    </p>
  </header>

  <section data-provider-config-panel class="rounded-md border border-border bg-card p-4">
    <div class="flex flex-col gap-1 border-b border-border pb-3">
      <p class="text-xs font-medium uppercase text-muted-foreground">Inference provider</p>
      <h2 class="text-lg font-semibold">{PROVIDER.name} connection</h2>
      <p class="text-sm text-muted-foreground">Validate credentials before saving. Keys stay masked in the form and are persisted only after a successful test.</p>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <label data-provider-name class="flex flex-col gap-1 text-sm font-medium">
        Provider
        <input class="h-11 rounded-md border border-input bg-background px-3 text-sm" value={PROVIDER.name} readonly aria-label="Provider name" />
      </label>

      <label data-provider-api-key class="flex flex-col gap-1 text-sm font-medium">
        API key
        <input
          bind:value={providerApiKey}
          class="h-11 rounded-md border border-input bg-background px-3 text-sm"
          type="password"
          autocomplete="off"
          aria-label="Provider API key"
        />
      </label>

      <label data-provider-base-url class="flex flex-col gap-1 text-sm font-medium">
        Base URL
        <input
          bind:value={providerBaseUrl}
          class="h-11 rounded-md border border-input bg-background px-3 text-sm"
          type="url"
          aria-label="Provider base URL"
        />
      </label>

      <label data-provider-timeout class="flex flex-col gap-1 text-sm font-medium">
        Timeout (ms)
        <input
          bind:value={providerTimeoutMs}
          class="h-11 rounded-md border border-input bg-background px-3 text-sm"
          type="number"
          min="1000"
          step="500"
          aria-label="Provider timeout"
        />
      </label>
    </div>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="button"
        data-provider-test
        class="min-h-11 rounded-md border border-border px-4 text-sm font-medium"
        onclick={testProvider}
      >Test provider</button>
      <button
        type="button"
        data-provider-save
        class="min-h-11 rounded-md border border-border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canSaveProvider}
        onclick={saveProvider}
      >Save credentials</button>
    </div>

    <div data-provider-test-result data-provider-status={providerTestStatus} class="mt-4 rounded-md border border-border bg-background p-3 text-sm">
      {#if providerTestStatus === "idle"}
        <p class="text-muted-foreground">No test run yet. Save remains disabled until credentials pass validation.</p>
      {:else if providerTestStatus === "connected"}
        <p class="font-medium text-success">connected</p>
        <dl class="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <div><dt>Latency</dt><dd data-provider-latency class="font-mono text-foreground">{providerLatencyMs}ms</dd></div>
          <div><dt>Version</dt><dd data-provider-version class="font-mono text-foreground">{PROVIDER.version}</dd></div>
          <div><dt>Quota</dt><dd data-provider-quota class="font-mono text-foreground">{PROVIDER.quotaRemaining} requests</dd></div>
        </dl>
      {:else}
        <p class="font-medium text-destructive">failed</p>
        <p data-provider-error class="mt-1 text-xs text-muted-foreground">{providerError}</p>
        <p data-provider-latency class="mt-1 font-mono text-xs text-foreground">{providerLatencyMs}ms</p>
      {/if}
    </div>

    <p data-provider-storage-note class="mt-3 text-xs text-muted-foreground">
      Storage target: OS credential store when available; encrypted Fulcrum credentials file fallback.
    </p>
    <p data-provider-save-state class="mt-2 text-xs text-muted-foreground">
      {providerSaved ? "Credentials saved after validation." : "Credentials not saved."}
    </p>
  </section>

  <div class="flex flex-col gap-3">
    <ul data-error-list class="flex flex-col gap-2 rounded-md border border-border">
      {#each ERRORS as event (event.id)}
        <li
          data-error-item={event.id}
          class={cn(
            "flex flex-col gap-1 border-b border-border px-3 py-2 last:border-0",
            activeId === event.id && "bg-muted/60",
          )}
        >
          <button
            type="button"
            data-error-open={event.id}
            class="flex w-full flex-col items-start gap-1 text-left text-sm"
            onclick={() => openError(event.id)}
          >
            <span class="flex items-center gap-2 font-medium">
              <span
                data-severity={event.severity}
                class={cn(
                  "rounded-sm px-2 py-0.5 text-xs",
                  event.severity === "error" && "bg-destructive/15 text-destructive",
                  event.severity === "warn" && "bg-warning/15 text-warning-foreground",
                  event.severity === "info" && "bg-muted text-muted-foreground",
                )}
              >{event.severity}</span>
              {event.message}
            </span>
            <span class="font-mono text-xs text-muted-foreground">{event.timestamp}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>

  {#if active}
    <div
      data-error-detail={active.id}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-detail-title"
      tabindex="-1"
      class="rounded-md border border-border bg-background p-4"
    >
      <header class="flex flex-col gap-1 border-b border-border pb-3">
        <div class="flex items-center justify-between gap-3">
          <h2 id="error-detail-title" data-error-detail-message class="text-lg font-semibold">{active.message}</h2>
          <button
            type="button"
            data-error-detail-close
            class="h-8 rounded-md border border-border px-2 text-sm"
            onclick={closeError}
          >Close</button>
        </div>
        <p class="text-xs text-muted-foreground">
          <span data-error-detail-timestamp class="font-mono">{active.timestamp}</span>
          <span class="mx-2">·</span>
          <span data-error-detail-severity>{active.severity}</span>
        </p>
      </header>

      <section data-error-detail-stack-section class="mt-3 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">Stack trace</h3>
          <button
            type="button"
            data-error-detail-copy
            class="h-8 rounded-md border border-border px-2 text-xs"
            onclick={copyStack}
          >{copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}</button>
        </div>
        <pre data-error-detail-stack class="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{active.stack}</pre>
      </section>

      <section data-error-detail-breadcrumbs-section class="mt-3 flex flex-col gap-2">
        <h3 class="text-sm font-medium">Breadcrumbs</h3>
        <ol data-error-detail-breadcrumbs class="flex flex-col gap-1 rounded-md border border-border p-3 text-xs">
          {#each active.breadcrumbs as crumb, index (crumb.timestamp + index)}
            <li data-breadcrumb={index} class="flex items-baseline gap-2">
              <span class="font-mono text-muted-foreground">{crumb.timestamp}</span>
              <span data-breadcrumb-severity={crumb.severity}>{crumb.severity}</span>
              <span>{crumb.message}</span>
            </li>
          {/each}
        </ol>
      </section>

      <section data-error-detail-related-section class="mt-3 flex flex-col gap-2">
        <h3 class="text-sm font-medium">Related events</h3>
        <ul data-error-detail-related class="flex flex-col gap-1 text-sm">
          {#each active.related as relation (relation.id)}
            <li data-related-kind={relation.kind}>
              <a
                data-related-link={relation.id}
                href={relation.href}
                class="text-primary underline"
              >{relation.label}</a>
            </li>
          {/each}
        </ul>
      </section>

      <footer class="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <a
          data-error-detail-source
          href={active.sourceHref}
          class="text-primary underline"
        >Open source event</a>
      </footer>
    </div>
  {/if}
</section>
