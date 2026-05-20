<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Button } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  /**
   * `agent-dependency-board` — absorbed into the Build graph.
   *
   * The former "Multi-agent dependency board" was a parallel, non-Build-routed
   * dependency surface (`design-alignment/build.md` §build-graph). Per
   * `prd-web-build-graph-od-fidelity` acceptance — "agent-dependency-board
   * behavior is absorbed so there is one Build graph, not two" — its
   * dependency-graph, status, and agent-assignment responsibilities now live in
   * the OD Sugiyama `/build-graph` layout.
   *
   * This route is kept as a permanent forwarding stub so the old path never
   * 404s (migration value-preservation: every old path resolves). It navigates
   * to `/build-graph` on the client and renders a no-JS fallback link.
   */
  $effect(() => {
    if (browser) void goto("/build-graph", { replaceState: true });
  });
</script>

<svelte:head>
  <title>Multi-agent dependency board · moved</title>
  <meta http-equiv="refresh" content="0; url=/build-graph" />
</svelte:head>

<main
  data-agent-board-page
  data-agent-board-absorbed="build-graph"
  class={cn("mx-auto flex max-w-xl flex-col items-start gap-3 p-6")}
>
  <h1 class={cn("text-h2 font-semibold")}>Multi-agent dependency board has moved</h1>
  <p data-agent-board-redirect-note class={cn("text-sm text-muted-foreground")}>
    The dependency board is now the Build graph — one Sugiyama dependency layout with
    status-colored nodes and per-node agent assignment.
  </p>
  <Button href="/build-graph" data-agent-board-redirect-link>Open the Build graph</Button>
</main>
