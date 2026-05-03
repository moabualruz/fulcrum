<script lang="ts">
  import Bell from "@lucide/svelte/icons/bell";
  import { cn } from "$lib/utils.js";

  interface Props {
    count: number;
  }

  const { count }: Props = $props();
</script>

<div data-bell-badge class={cn("relative inline-flex items-center")}>
  <Bell aria-hidden="true" class={cn("h-5 w-5")} />
  {#if count > 0}
    <span
      data-bell-count
      class={cn(
        "absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center",
        "rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground",
      )}
    >{count}</span>
  {/if}
</div>
