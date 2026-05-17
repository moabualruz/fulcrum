<script lang="ts" module>
  import type { RunStatus } from "$lib/server/runs";

  export function badgeClass(s: RunStatus): string {
    switch (s) {
      case "succeeded":
        return "rounded px-2 py-0.5 text-xs bg-emerald-100 text-emerald-900";
      case "running":
        return "rounded px-2 py-0.5 text-xs bg-blue-100 text-blue-900 animate-pulse";
      case "queued":
        return "rounded px-2 py-0.5 text-xs bg-zinc-100 text-zinc-900";
      case "failed":
      case "cancelled":
        return "rounded px-2 py-0.5 text-xs bg-rose-100 text-rose-900";
    }
  }

  export function label(s: RunStatus): string {
    // `in_progress` is not part of `RunStatus`, but keep tolerant for reuse.
    return (s as string) === "in_progress"
      ? "In progress"
      : s.charAt(0).toUpperCase() + s.slice(1);
  }
</script>

<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    status: RunStatus;
  }

  const { status }: Props = $props();
</script>

<span data-run-status data-status={status} class={cn(badgeClass(status))}
  >{label(status)}</span
>
