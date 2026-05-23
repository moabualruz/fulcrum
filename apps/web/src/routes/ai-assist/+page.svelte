<script lang="ts">
  /*
   * AI Assist reference route (ai-assist.html).
   *
   * Per DESIGN.md §3.1, IA-MAP.md §5 and cross-states.md §ai-assist.html, AI
   * Assist is NOT its own screen: it is a shell-level overlay drawer that opens
   * with `⌘/` from any frame. The OD `ai-assist.html` comment block says it
   * outright: "This page just lands you with it open."
   *
   * So `/ai-assist` survives only as a reference/deeplink route: on mount it
   * dispatches `fulcrum:open-ai-assist`, which the ONE shell `AcpDrawer`
   * instance in `+layout.svelte` listens for. There is NO route-local drawer
   * copy here: that violated the AGENTS.md ui-kit rule and the OD intent. The
   * underlay below explains the surface and reproduces the `.anchor` mode row.
   */
  import { onMount } from "svelte";
  import { Badge, ModeRow, StatusBadge, TraceChip } from "@fulcrum/ui-kit";

  let selectedMode = $state<"play" | "discuss" | "ai-assist" | "trace">("ai-assist");

  function openAssist(): void {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fulcrum:open-ai-assist"));
    }
  }

  // Land with the shell drawer open, matching the OD reference behaviour.
  // Child `onMount` runs before the parent layout's `onMount` registers the
  // `fulcrum:open-ai-assist` listener, so defer the dispatch one macrotask.
  onMount(() => {
    const id = setTimeout(openAssist, 0);
    return () => clearTimeout(id);
  });
</script>

<svelte:head>
  <title>AI Assist</title>
</svelte:head>

<section
  class="mx-auto grid max-w-3xl gap-6 text-sm text-muted-foreground"
  data-ai-assist-page
  data-ai-assist-ready="true"
>
  <nav
    class="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
    aria-label="Breadcrumb"
  >
    <span>AI Assist</span>
    <span aria-hidden="true">›</span>
    <span>drawer</span>
    <span aria-hidden="true">›</span>
    <strong class="text-foreground">reference</strong>
  </nav>

  <header class="grid gap-3 border-b border-border pb-5">
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">Plan</Badge>
      <StatusBadge status="running" />
      <TraceChip badge traceId="4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f" project="fulcrum" />
    </div>
    <h1 class="text-2xl font-semibold tracking-normal text-foreground">AI Assist</h1>
    <p class="max-w-2xl leading-6">
      The drawer is the same surface that opens with <kbd
        class="rounded-sm border border-border px-1 font-mono text-xs">⌘ /</kbd
      > from any frame. This page just lands you with it open. The underlying stage is still
      <strong class="text-foreground">Plan</strong>; AI Assist is anchored to the live planning
      session <code class="font-mono text-xs">run_8f29a4c</code>.
    </p>
  </header>

  <section
    class="rounded-md border border-border bg-card p-4"
    data-ai-assist-anchor
  >
    <div class="flex flex-col gap-4 xl:flex-row xl:items-center">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge status="running" />
          <h2 class="text-base font-semibold tracking-normal text-foreground">
            Step 3 / 8 · Persist issuance row per kid
          </h2>
        </div>
        <p class="mt-2 max-w-2xl leading-6">
          Anchored to <code class="font-mono text-xs">run_8f29a4c</code>. The
          <strong class="text-foreground">⊞ AI Assist</strong> mode opens the same shell drawer
          this page just opened: one instance, every frame.
        </p>
      </div>
      <ModeRow
        bind:value={selectedMode}
        modes={["play", "discuss", "ai-assist", "trace"]}
        ariaLabel="Step modes"
        data-ai-assist-mode-row
      />
    </div>
  </section>

  <p class="leading-6" data-ai-assist-reference-note>
    The drawer carries a session/policy/cost/cache meta strip, an agent picker that swaps the
    agent in-flight while the trace ID stays bound, and a
    <strong class="text-foreground">Save thread to prompt template</strong> action. Open it from
    Build runs, Review, or Operate: the entry point lives in the status footer
    (<kbd class="rounded-sm border border-border px-1 font-mono text-xs">⌘ /</kbd>) on every
    screen.
  </p>

  <button
    type="button"
    data-ai-assist-open-drawer
    class="justify-self-start rounded-md border border-accent bg-surface-elevated px-3 py-2 text-sm font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onclick={openAssist}
  >
    ⊞ Open AI Assist drawer
  </button>
</section>
