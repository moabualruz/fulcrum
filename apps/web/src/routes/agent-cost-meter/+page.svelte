<script lang="ts">
  type Tier = "low" | "medium" | "high";
  const PRICE_PER_1K = 0.003;
  const TIER_THRESHOLDS: Record<Tier, number> = { low: 5000, medium: 25000, high: Infinity };

  let tokens = $state(0);
  let calls = $state(0);
  let priceAvailable = $state(true);

  function addMessage(): void {
    tokens += 850;
  }

  function addTool(): void {
    tokens += 220;
    calls += 1;
  }

  function reset(): void {
    tokens = 0;
    calls = 0;
  }

  function togglePrice(): void {
    priceAvailable = !priceAvailable;
  }

  function compact(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(n);
  }

  const tier = $derived<Tier>(tokens < TIER_THRESHOLDS.low ? "low" : tokens < TIER_THRESHOLDS.medium ? "medium" : "high");
  const cost = $derived((tokens / 1000) * PRICE_PER_1K);
</script>

<svelte:head>
  <title>Agent cost meter | Fulcrum</title>
</svelte:head>

<header class="border-b border-border bg-background">
  <div class="mx-auto flex max-w-4xl items-center justify-between gap-4 p-4">
    <h1 class="text-lg font-semibold">Agent run</h1>
    <div
      data-cost-meter
      data-cost-tier={tier}
      class="flex items-center gap-3 rounded-md border border-border px-3 py-1 text-xs sm:flex-row md:ml-auto"
    >
      <span data-cost-tokens class="font-medium">{compact(tokens)} tokens</span>
      <span data-cost-calls>{calls} calls</span>
      {#if priceAvailable}
        <span data-cost-estimate>${cost.toFixed(4)}</span>
      {:else}
        <span data-cost-estimate-missing class="text-muted-foreground">price n/a</span>
      {/if}
      <span data-cost-tier-icon aria-hidden="true">
        {tier === "low" ? "●" : tier === "medium" ? "◐" : "◉"}
      </span>
    </div>
  </div>
</header>

<main class="mx-auto max-w-4xl space-y-4 p-6" data-agent-cost-page>
  <p class="text-sm text-muted-foreground">Simulate agent activity to watch counters increment and tier change.</p>
  <div class="flex flex-wrap gap-2">
    <button type="button" data-cost-add-message onclick={addMessage} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Add streamed message (+850 tokens)</button>
    <button type="button" data-cost-add-tool onclick={addTool} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Add tool call (+220 tokens, +1 call)</button>
    <button type="button" data-cost-toggle-price onclick={togglePrice} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Toggle price availability</button>
    <button type="button" data-cost-reset onclick={reset} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Reset</button>
  </div>
</main>
