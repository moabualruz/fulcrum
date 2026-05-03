<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";
  import type { SubsystemCheckResult, SubsystemStatus } from "./+page.server";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Auto-refresh interval handle
  let refreshCount = $state(0);
  let lastRefresh = $state(new Date().toISOString());
  let expanded = $state<Record<string, boolean>>({});

  // Invalidate by incrementing refreshCount; SvelteKit re-runs load on invalidate.
  // For simplicity in SSR-only mode we use a reactive timer approach.
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    autoRefreshTimer = setInterval(() => {
      lastRefresh = new Date().toISOString();
      refreshCount += 1;
      // Trigger a full data reload via navigation invalidation
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }, 30_000);
    return () => {
      if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    };
  });

  function refreshNow() {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  function toggleExpanded(subsystem: string) {
    expanded[subsystem] = !expanded[subsystem];
  }

  function statusColor(status: SubsystemStatus): string {
    if (status === "ok") return "text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950";
    if (status === "warn") return "text-yellow-700 border-yellow-300 bg-yellow-50 dark:text-yellow-400 dark:border-yellow-700 dark:bg-yellow-950";
    return "text-red-700 border-red-300 bg-red-50 dark:text-red-400 dark:border-red-700 dark:bg-red-950";
  }

  function statusLabel(status: SubsystemStatus): string {
    if (status === "ok") return "ok";
    if (status === "warn") return "warn";
    return "fail";
  }

  function shortTs(iso: string): string {
    return iso.replace("T", " ").slice(0, 19) + "Z";
  }

  function overallStatus(checks: SubsystemCheckResult[]): SubsystemStatus {
    if (checks.some((c) => c.status === "fail")) return "fail";
    if (checks.some((c) => c.status === "warn")) return "warn";
    return "ok";
  }
</script>

<header data-doctor-header class={cn("mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4")}>
  <div>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Doctor</h1>
    <p class={cn("text-sm text-muted-foreground")}>Per-subsystem health — auto-refreshes every 30 s</p>
  </div>
  <button
    type="button"
    data-refresh-now
    onclick={refreshNow}
    class={cn("rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted")}
  >
    Refresh now
  </button>
</header>

{#await data.streamed.checks}
  <RouteSkeleton kind="list" />
{:then checks}
  {@const overall = overallStatus(checks)}
  <div data-doctor-overall data-status={overall} class={cn("mb-4 flex items-center gap-2 rounded-md border px-4 py-2 text-sm", statusColor(overall))}>
    <span class={cn("font-semibold uppercase")}>{statusLabel(overall)}</span>
    <span>— {checks.filter((c) => c.status === "ok").length}/{checks.length} subsystems healthy</span>
    <span class={cn("ml-auto text-xs opacity-70")}>last checked {shortTs(lastRefresh)}</span>
  </div>

  <div data-slot="table-container" class={cn("w-full overflow-x-auto")}>
    <table data-doctor-table data-slot="table" class={cn("w-full caption-bottom text-sm")}>
      <thead>
        <tr class={cn("border-b")}>
          <th class={cn("h-10 px-2 text-left font-medium text-muted-foreground")}>Subsystem</th>
          <th class={cn("h-10 px-2 text-left font-medium text-muted-foreground")}>Status</th>
          <th class={cn("h-10 px-2 text-left font-medium text-muted-foreground")}>Message</th>
          <th class={cn("h-10 px-2 text-left font-medium text-muted-foreground")}>Checked at</th>
          <th class={cn("h-10 px-2 text-left font-medium text-muted-foreground")}>Recovery</th>
        </tr>
      </thead>
      <tbody>
        {#each checks as check (check.subsystem)}
          <tr
            data-doctor-row
            data-subsystem={check.subsystem}
            data-status={check.status}
            class={cn("border-b hover:bg-muted/50")}
          >
            <td class={cn("p-2 font-medium")}>{check.label}</td>
            <td class={cn("p-2")}>
              <span
                data-status-badge
                data-status={check.status}
                class={cn("rounded border px-2 py-0.5 text-xs font-semibold uppercase", statusColor(check.status))}
              >{statusLabel(check.status)}</span>
            </td>
            <td class={cn("p-2 text-muted-foreground")}>{check.message}</td>
            <td class={cn("p-2 font-mono text-xs text-muted-foreground")}>{shortTs(check.checked_at)}</td>
            <td class={cn("p-2")}>
              {#if check.recovery}
                <button
                  type="button"
                  data-recovery-toggle
                  data-subsystem={check.subsystem}
                  onclick={() => toggleExpanded(check.subsystem)}
                  class={cn("rounded border border-border px-2 py-0.5 text-xs hover:bg-muted")}
                  aria-expanded={expanded[check.subsystem] ?? false}
                >
                  {expanded[check.subsystem] ? "Hide" : "Show"} recovery
                </button>
                {#if expanded[check.subsystem]}
                  <div
                    data-recovery-text
                    data-subsystem={check.subsystem}
                    class={cn("mt-1 rounded bg-muted px-2 py-1 font-mono text-xs")}
                  >{check.recovery}</div>
                {/if}
              {:else}
                <span class={cn("text-xs text-muted-foreground")}>—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:catch err}
  <div data-doctor-error class={cn("rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700")}>
    Failed to load health checks: {err?.message ?? String(err)}
  </div>
{/await}
