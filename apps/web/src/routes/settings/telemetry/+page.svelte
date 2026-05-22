<script lang="ts">
  import type { PageData, ActionData } from "./$types";
  import { enhance } from "$app/forms";
  import { cn } from "@fulcrum/ui-kit";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";

  interface Props { data: PageData; form: ActionData }
  let { data, form }: Props = $props();

  let purgedCount = $state<number | null>(null);

  $effect(() => {
    if (form && "rowCount" in form) {
      purgedCount = form.rowCount as number;
    }
  });
</script>

<header class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Telemetry</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  <div class={cn("flex flex-col gap-6 max-w-lg")}>
    <!-- Opt-in toggle -->
    <div class={cn("flex items-center justify-between rounded-lg border border-border p-4")}>
      <div>
        <p class={cn("font-medium text-sm")}>Telemetry opt-in</p>
        <p class={cn("text-xs text-muted-foreground mt-0.5")}>
          Share anonymous usage data to improve Fulcrum.
        </p>
      </div>
      <form method="POST" action="?/toggleOptIn" use:enhance>
        <button
          type="submit"
          data-opt-in-toggle
          data-enabled={payload.optIn}
          aria-label={payload.optIn ? "Disable telemetry" : "Enable telemetry"}
          class={cn(
            "inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
            payload.optIn ? "bg-primary" : "bg-muted",
          )}
          aria-pressed={payload.optIn}
        >
          <span class={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
            payload.optIn ? "translate-x-5" : "translate-x-0",
          )}></span>
        </button>
      </form>
    </div>

    <!-- Purge -->
    <div class={cn("flex items-center justify-between rounded-lg border border-border p-4")}>
      <div>
        <p class={cn("font-medium text-sm")}>Purge local telemetry</p>
        <p class={cn("text-xs text-muted-foreground mt-0.5")}>
          Delete all locally-stored telemetry events.
        </p>
        <span data-row-count
          class={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-mono mt-1")}>
          {purgedCount !== null ? purgedCount : payload.rowCount} rows
        </span>
      </div>
      <form method="POST" action="?/purge" use:enhance>
        <button type="submit" data-purge-btn
          class={cn(buttonVariants({ variant: "destructive" }))}>Purge</button>
      </form>
    </div>
  </div>
{/await}
