<script lang="ts">
  /**
   * `/artifacts` re-home stub — the generic file-artifact list is re-homed to
   * the Ship stage workbench at `/ship` (`IA-MAP.md §2.5`,
   * `design-alignment/ship.md`). `+page.server.ts` issues a 301
   * (`MOVED_PERMANENTLY`) redirect to `/ship` on every GET, so this markup is
   * never reached by a normal navigation; it stays as the route's required
   * `+page.svelte` and as a no-JS deprecation notice.
   *
   * The `upload` / `bulk` server actions and the `/artifacts/[id]/download`
   * endpoint are preserved on the server — only the *list view* moved.
   */
  import { Button } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";
</script>

<svelte:head><title>Artifacts moved to Ship | Fulcrum</title></svelte:head>

<div
  data-artifacts-rehomed
  class={cn("mx-auto mt-10 max-w-md rounded-md border border-border bg-card p-6 text-center")}
>
  <h1 class={cn("text-lg font-semibold")}>Artifacts moved to Ship</h1>
  <p class={cn("mt-2 text-sm text-muted-foreground")}>
    The artifacts list is now the Ship stage workbench. This page redirects to
    <code class={cn("font-mono")}>/ship</code> automatically.
  </p>
  <Button data-artifacts-ship-link variant="default" size="sm" href="/ship" class={cn("mt-4")}>
    Open Ship
  </Button>
</div>
