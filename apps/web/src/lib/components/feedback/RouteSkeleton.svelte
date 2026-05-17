<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    kind: "list" | "detail" | "board";
    rows?: number;
  }

  let { kind, rows = 6 }: Props = $props();
</script>

<div data-route-skeleton data-kind={kind} aria-busy="true" role="status">
  <span class={cn("sr-only")}>Loading…</span>

  {#if kind === "list"}
    <div data-skeleton-list>
      {#each Array(rows) as _}
        <div data-skeleton-row class={cn("animate-pulse bg-muted h-8 w-full rounded")}></div>
      {/each}
    </div>
  {/if}

  {#if kind === "detail"}
    <div data-skeleton-detail>
      <div data-skeleton-title class={cn("animate-pulse bg-muted h-8 w-full rounded mb-4")}></div>
      {#each Array(3) as _}
        <div data-skeleton-paragraph class={cn("animate-pulse bg-muted h-4 w-full rounded mb-3")}></div>
      {/each}
    </div>
  {/if}

  {#if kind === "board"}
    <div data-skeleton-board class={cn("flex gap-4")}>
      {#each Array(5) as _}
        <div data-skeleton-column class={cn("flex-1 flex flex-col gap-3")}>
          {#each Array(3) as _}
            <div data-skeleton-card class={cn("animate-pulse bg-muted h-24 w-full rounded")}></div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>
