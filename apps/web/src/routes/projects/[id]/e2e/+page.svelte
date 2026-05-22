<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";

  interface E2eResult {
    status?: string;
    testFiles?: string[];
    runner?: string;
    traceId?: string;
    exitCode?: number | null;
    summary?: string;
    outputRef?: string;
    durationMs?: number;
  }

  interface E2eHistoryEntry {
    eventId: string;
    createdAt: string;
    runner: string;
    status: string;
    testFileCount: number;
    exitCode: number | null;
    traceId: string | null;
  }

  interface Props {
    data: { projectId: string; history: E2eHistoryEntry[] };
    form?: {
      ok: boolean;
      mode?: "runE2e";
      error?: string;
      result?: E2eResult;
    } | null;
  }

  let { data, form = null }: Props = $props();

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  function statusColor(status: string): string {
    if (status === "passed") return "text-green-600";
    if (status === "failed") return "text-red-600";
    return "text-yellow-600";
  }
</script>

<svelte:head>
  <title>E2E Runner</title>
</svelte:head>

<div data-testid="e2e-runner-page">
  <header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-6")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>
        &larr; Project
      </a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>E2E Runner</h1>
    </div>
  </header>

  <section data-e2e-run-form class={cn("mb-6 space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Run Generated E2E Tests</h2>
    <form method="POST" action="?/runE2e" class={cn("grid gap-3 rounded-md border border-border p-4 lg:grid-cols-[minmax(0,1fr)_16rem]")}>
      <div class={cn("grid gap-3")}>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("font-medium text-foreground")}>Runner</span>
          <select
            name="runner"
            class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
          >
            <option value="bun">bun</option>
            <option value="playwright">playwright</option>
          </select>
        </label>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("font-medium text-foreground")}>Test files (optional, comma-separated)</span>
          <textarea
            name="testFiles"
            rows="3"
            placeholder="tests/e2e/login.test.ts, tests/e2e/dashboard.test.ts"
            class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
          ></textarea>
        </label>
        <button
          type="submit"
          class={cn("h-9 w-max rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground")}
        >
          Run E2E Tests
        </button>
      </div>
      <aside class={cn("grid h-max gap-3 rounded-md border border-border p-3")}>
        <label class={cn("grid gap-1 text-sm")}>
          <span class={cn("font-medium text-foreground")}>Trace ID</span>
          <input
            name="traceId"
            value="trace-e2e-{data.projectId}"
            class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
          />
        </label>
      </aside>
    </form>
  </section>

  {#if form?.ok === false && form.error}
    <div class={cn("mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive")} data-e2e-error>
      {form.error}
    </div>
  {/if}

  {#if form?.ok && form.result}
    {@const result = form.result}
    <section data-e2e-result class={cn("mb-6 space-y-3")}>
      <h2 class={cn("text-lg font-semibold")}>Run Result</h2>
      <div class={cn("grid gap-2 sm:grid-cols-4 rounded-md border border-border p-4")}>
        <div>
          <div class={cn("text-xs text-muted-foreground")}>Status</div>
          <div class={cn("font-medium", result.status === "passed" ? "text-green-600" : "text-red-600")}>
            {result.status ?? "unknown"}
          </div>
        </div>
        {#if result.runner}
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Runner</div>
            <div class={cn("font-medium")}>{result.runner}</div>
          </div>
        {/if}
        {#if result.exitCode !== undefined && result.exitCode !== null}
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Exit Code</div>
            <div class={cn("font-medium")}>{result.exitCode}</div>
          </div>
        {/if}
        {#if result.durationMs !== undefined}
          <div>
            <div class={cn("text-xs text-muted-foreground")}>Duration</div>
            <div class={cn("font-medium")}>{result.durationMs}ms</div>
          </div>
        {/if}
      </div>

      {#if result.summary}
        <div class={cn("rounded-md border border-border p-3 text-sm text-foreground")}>
          {result.summary}
        </div>
      {/if}

      {#if result.traceId}
        <div class={cn("text-xs text-muted-foreground")}>Trace: {result.traceId}</div>
      {/if}

      {#if result.outputRef}
        <div class={cn("text-xs text-muted-foreground")}>Output: {result.outputRef}</div>
      {/if}

      {#if result.testFiles?.length}
        <div class={cn("grid gap-1")}>
          <h3 class={cn("text-sm font-semibold text-muted-foreground")}>Test Files</h3>
          {#each result.testFiles as file}
            <div class={cn("text-sm text-foreground")}>{file}</div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- Run History -->
  <section data-e2e-history class={cn("space-y-3")}>
    <h2 class={cn("text-lg font-semibold")}>Run History</h2>
    {#if data.history.length === 0}
      <p class={cn("text-sm text-muted-foreground")}>No runs recorded yet.</p>
    {:else}
      <div class={cn("overflow-hidden rounded-md border border-border")}>
        <table class={cn("w-full text-sm")}>
          <thead>
            <tr class={cn("border-b border-border bg-muted/30")}>
              <th class={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>Time</th>
              <th class={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>Status</th>
              <th class={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>Runner</th>
              <th class={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>Tests</th>
              <th class={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>Exit</th>
              <th class={cn("px-3 py-2 text-left text-xs font-medium text-muted-foreground")}>Trace</th>
            </tr>
          </thead>
          <tbody>
            {#each data.history as entry (entry.eventId)}
              <tr class={cn("border-b border-border last:border-0 hover:bg-muted/20")}>
                <td class={cn("px-3 py-2 text-xs text-muted-foreground")}>{formatDate(entry.createdAt)}</td>
                <td class={cn("px-3 py-2")}>
                  <span class={cn("inline-flex items-center gap-1 text-xs font-medium", statusColor(entry.status))}>
                    {#if entry.status === "passed"}
                      <span class={cn("h-2 w-2 rounded-full bg-green-500")}></span>
                    {:else if entry.status === "failed"}
                      <span class={cn("h-2 w-2 rounded-full bg-red-500")}></span>
                    {:else}
                      <span class={cn("h-2 w-2 rounded-full bg-yellow-500")}></span>
                    {/if}
                    {entry.status}
                  </span>
                </td>
                <td class={cn("px-3 py-2 text-xs")}>{entry.runner}</td>
                <td class={cn("px-3 py-2 text-xs")}>{entry.testFileCount}</td>
                <td class={cn("px-3 py-2 text-xs font-mono")}>{entry.exitCode ?? "-"}</td>
                <td class={cn("px-3 py-2 text-xs text-muted-foreground font-mono truncate max-w-[10rem]")}>{entry.traceId ?? "-"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
