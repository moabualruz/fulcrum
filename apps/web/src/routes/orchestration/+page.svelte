<script lang="ts">
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn, Select } from "@fulcrum/ui-kit";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { SYMPHONY_COLORS, type SymphonyState } from "$lib/orchestration";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // 5s polling fallback (SSE when FULCRUM_FEATURES=real-time-collab-server)
  $effect(() => {
    if (!browser) return;
    const handle = setInterval(() => {
      void invalidateAll();
    }, 5000);
    return () => clearInterval(handle);
  });

  function claimBadgeClass(state: string | null): string {
    if (!state) return "bg-muted text-muted-foreground";
    return SYMPHONY_COLORS[state as SymphonyState] ?? "bg-muted text-muted-foreground";
  }

  function claimLabel(row: { orchestration_state: string | null; claimed_by: string | null }): string {
    if (!row.orchestration_state) return row.claimed_by ? `claimed:${row.claimed_by.slice(0, 8)}` : "-";
    return row.claimed_by
      ? `${row.orchestration_state} (${row.claimed_by.slice(0, 8)})`
      : row.orchestration_state;
  }

  function onProjectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    const url = new URL(page.url);
    if (select.value) {
      url.searchParams.set("project", select.value);
    } else {
      url.searchParams.delete("project");
    }
    void goto(url.toString(), { replaceState: true });
  }
</script>

<header
  data-orchestration-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Orchestration</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <!-- Status tiles -->
  <section data-orchestration-status class={cn("mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4")}>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Last tick</div>
      <div class={cn("text-sm font-medium")}>{payload.status.lastTickAt ?? "Never"}</div>
    </div>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Worker</div>
      <div class={cn("text-sm font-medium")}>{payload.status.workerConnected ? "Connected" : "Disconnected"}</div>
    </div>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Concurrency</div>
      <div class={cn("text-sm font-medium")}>{payload.status.concurrencyUsed} / {payload.status.concurrencyMax}</div>
    </div>
    <div class={cn("rounded-lg border border-border bg-background p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Last sync</div>
      <div class={cn("text-sm font-medium")}>{payload.status.lastSyncDate ?? "Never"}</div>
    </div>
  </section>

  <!-- Project filter -->
  <section data-orchestration-filter class={cn("mb-4 flex items-center gap-3")}>
    <label class={cn("text-sm font-medium")} for="project-filter">Filter by project</label>
    <select
      id="project-filter"
      data-project-filter
      onchange={onProjectChange}
      value={data.projectFilter}
      class={cn("rounded-md border border-input bg-background px-3 py-1.5 text-sm")}
    >
      <option value="">All projects</option>
      {#each payload.projects as project (project.id)}
        <option value={project.id}>{project.name}</option>
      {/each}
    </select>
  </section>

  <!-- Recent dispatches table -->
  <section data-orchestration-dispatches class={cn("mb-6")}>
    <h2 class={cn("text-lg font-semibold mb-2")}>Recent dispatches</h2>
    {#if payload.dispatches.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No dispatches yet.</div>
    {:else}
      <div class={cn("overflow-auto rounded-lg border border-border")}>
        <table class={cn("w-full text-sm")}>
          <thead>
            <tr class={cn("border-b border-border bg-muted/50")}>
              <th class={cn("px-3 py-2 text-left font-medium")}>Agent</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Status</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Claim state</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Started</th>
              <th class={cn("px-3 py-2 text-left font-medium")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each payload.dispatches as d (d.id)}
              <tr data-dispatch-row={d.id} class={cn("border-b border-border last:border-0")}>
                <td class={cn("px-3 py-2 font-medium")}>{d.agent}</td>
                <td class={cn("px-3 py-2")}>{d.status}</td>
                <td class={cn("px-3 py-2")}>
                  <span
                    data-claim-badge={d.id}
                    class={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                      claimBadgeClass(d.orchestration_state ?? d.symphony_state),
                    )}
                  >{claimLabel(d)}</span>
                </td>
                <td class={cn("px-3 py-2 font-mono text-xs")}>{d.started_at}</td>
                <td class={cn("px-3 py-2")}>
                  <div class={cn("flex items-center gap-1")}>
                    {#if d.status === "running" || d.status === "queued"}
                      <form method="POST" action="?/cancel" use:enhance>
                        <input type="hidden" name="run_id" value={d.id} />
                        <button
                          type="submit"
                          data-cancel-button={d.id}
                          class={cn(buttonVariants({ variant: "danger", size: "sm" }))}
                        >Cancel</button>
                      </form>
                    {/if}
                    {#if d.status === "failed" || d.status === "cancelled"}
                      <form method="POST" action="?/retry" use:enhance>
                        <input type="hidden" name="run_id" value={d.id} />
                        <button
                          type="submit"
                          data-retry-button={d.id}
                          class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                        >Retry</button>
                      </form>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- Retry queue -->
  <section data-orchestration-retry-queue>
    <h2 class={cn("text-lg font-semibold mb-2")}>Retry queue</h2>
    {#if payload.retryQueue.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No runs awaiting retry.</div>
    {:else}
      <ul class={cn("flex flex-col gap-2")}>
        {#each payload.retryQueue as r (r.id)}
          <li class={cn("rounded-md border border-border bg-background p-3 text-sm")}>
            <span class={cn("font-medium")}>{r.agent}</span>
            {#if r.last_error_kind}
              <span class={cn("ml-2 text-xs text-muted-foreground")}>{r.last_error_kind}</span>
            {/if}
            <span class={cn("ml-2 text-xs text-muted-foreground")}>retries: {r.retry_count}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/await}
