<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    current: number;
    limit: number;
  }

  const { current, limit }: Props = $props();

  const pct = $derived(limit > 0 ? current / limit : 0);
  const color = $derived(
    pct > 1
      ? "text-destructive font-semibold"
      : pct >= 0.8
        ? "text-yellow-600 dark:text-yellow-400 font-medium"
        : "text-green-600 dark:text-green-400"
  );
</script>

<span
  data-wip-indicator
  data-current={current}
  data-limit={limit}
  class={cn("text-xs tabular-nums", color)}
  title={`WIP limit: ${current} / ${limit}`}
>
  {current}/{limit}
</span>
