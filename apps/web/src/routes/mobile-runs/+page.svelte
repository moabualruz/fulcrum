<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Severity = "error" | "warn" | "info";

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
  const active = $derived(ERRORS.find((event) => event.id === activeId) ?? null);

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
    <aside
      data-error-detail={active.id}
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-detail-title"
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
    </aside>
  {/if}
</section>
