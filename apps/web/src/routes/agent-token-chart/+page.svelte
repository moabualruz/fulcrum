<script lang="ts">
  type Turn = { id: string; model: "claude" | "gpt"; input: number; output: number };

  let turns = $state<Turn[]>([
    { id: "t1", model: "claude", input: 200, output: 350 },
    { id: "t2", model: "claude", input: 180, output: 410 },
    { id: "t3", model: "gpt", input: 220, output: 320 },
  ]);
  let hoveredId = $state<string | null>(null);

  function addTurn(model: "claude" | "gpt"): void {
    const n = turns.length + 1;
    turns = [...turns, { id: `t${n}`, model, input: 150 + n * 10, output: 300 + n * 20 }];
  }

  function hover(id: string | null): void { hoveredId = id; }

  const cumulative = $derived(turns.reduce((s, t) => s + t.input + t.output, 0));
  const hoveredTurn = $derived(turns.find((t) => t.id === hoveredId) ?? null);
  const maxTurnTotal = $derived(Math.max(1, ...turns.map((t) => t.input + t.output)));
</script>

<svelte:head><title>Token usage chart | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-token-chart-page>
  <h1 class="text-2xl font-semibold">Token usage</h1>

  <p class="text-sm">Cumulative tokens: <span data-token-cumulative class="font-medium">{cumulative}</span></p>

  <div class="flex gap-2">
    <button type="button" data-token-add-claude onclick={() => addTurn("claude")} class="rounded-md border border-border px-3 py-1 text-xs">Add claude turn</button>
    <button type="button" data-token-add-gpt onclick={() => addTurn("gpt")} class="rounded-md border border-border px-3 py-1 text-xs">Add gpt turn</button>
  </div>

  <div data-token-chart class="flex items-end gap-2 rounded-md border border-border p-3 sm:flex-col md:flex-row" aria-label="Token usage stacked bars">
    {#each turns as turn}
      <button
        type="button"
        data-token-bar={turn.id}
        data-token-bar-model={turn.model}
        onmouseenter={() => hover(turn.id)}
        onmouseleave={() => hover(null)}
        onfocus={() => hover(turn.id)}
        onblur={() => hover(null)}
        aria-label={`${turn.id} ${turn.model} ${turn.input + turn.output} tokens`}
        class="flex w-8 flex-col-reverse rounded-md border border-border"
        style="height: {(turn.input + turn.output) / maxTurnTotal * 120}px"
      >
        <span data-token-bar-input class="block w-full bg-muted" style="height: {turn.input / (turn.input + turn.output) * 100}%"></span>
        <span data-token-bar-output class="block w-full bg-primary" style="height: {turn.output / (turn.input + turn.output) * 100}%"></span>
      </button>
    {/each}
  </div>

  {#if hoveredTurn}
    <p data-token-hover class="text-xs text-muted-foreground">
      <span data-token-hover-id>{hoveredTurn.id}</span> · <span data-token-hover-model>{hoveredTurn.model}</span> · input <span data-token-hover-input>{hoveredTurn.input}</span> / output <span data-token-hover-output>{hoveredTurn.output}</span>
    </p>
  {/if}
</main>
