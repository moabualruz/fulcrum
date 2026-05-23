<script lang="ts">
  type Turn = { ts: string; input: number; output: number; cost: number };
  type RateEvent = { ts: string; reason: string; backoffSec: number };

  const TURNS: Turn[] = [
    { ts: "10:00", input: 200, output: 350, cost: 0.0018 },
    { ts: "10:02", input: 180, output: 410, cost: 0.0021 },
    { ts: "10:04", input: 220, output: 320, cost: 0.0016 },
    { ts: "10:06", input: 260, output: 480, cost: 0.0026 },
  ];
  const RATE_EVENTS: RateEvent[] = [
    { ts: "10:03", reason: "anthropic rate-limit (429)", backoffSec: 3 },
    { ts: "10:05", reason: "anthropic rate-limit (429)", backoffSec: 7 },
  ];

  const TOTAL_INPUT = TURNS.reduce((s, t) => s + t.input, 0);
  const TOTAL_OUTPUT = TURNS.reduce((s, t) => s + t.output, 0);
  const TOTAL_COST = TURNS.reduce((s, t) => s + t.cost, 0);
  const BUDGET = 1.0;
  const MAX_TREND = Math.max(1, ...TURNS.map((t) => t.cost));
</script>

<svelte:head><title>Run cost & token tracking | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-run-cost-page>
  <h1 class="text-2xl font-semibold">Run cost &amp; token tracking</h1>

  <dl class="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
    <div><dt class="text-xs text-muted-foreground">Total tokens (input)</dt><dd data-cost-total-input>{TOTAL_INPUT}</dd></div>
    <div><dt class="text-xs text-muted-foreground">Total tokens (output)</dt><dd data-cost-total-output>{TOTAL_OUTPUT}</dd></div>
    <div><dt class="text-xs text-muted-foreground">Model cost</dt><dd data-cost-total-amount>${TOTAL_COST.toFixed(4)}</dd></div>
    <div><dt class="text-xs text-muted-foreground">Budget remaining</dt><dd data-cost-budget-remaining>${(BUDGET - TOTAL_COST).toFixed(4)}</dd></div>
  </dl>

  <section data-cost-rate-events class="space-y-1 rounded-md border border-border p-3 text-xs">
    <h2 class="text-base font-medium">Rate-limit events</h2>
    {#each RATE_EVENTS as e, idx}
      <p data-rate-event={idx}>{e.ts} · <span data-rate-event-backoff>{e.backoffSec}s</span> backoff · {e.reason}</p>
    {/each}
  </section>

  <section data-cost-trend class="rounded-md border border-border p-3">
    <h2 class="text-base font-medium">Cost trend</h2>
    <div class="flex items-end gap-2" aria-label="Cost per turn">
      {#each TURNS as t, idx}
        <span
          data-cost-trend-bar={idx}
          data-cost-trend-ts={t.ts}
          aria-label={`${t.ts} cost ${t.cost}`}
          style="height: {t.cost / MAX_TREND * 80}px"
          class="w-8 rounded-md bg-primary"
        ></span>
      {/each}
    </div>
  </section>
</main>
