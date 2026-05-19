<script lang="ts">
  type ModelStatus = "available" | "downloaded" | "pulling";
  type Model = { name: string; version: string; provider: string; status: ModelStatus; contextWindow: number; cost: number; updated: string };

  let models = $state<Model[]>([
    { name: "claude-opus-4-7", version: "4.7", provider: "anthropic", status: "available", contextWindow: 200000, cost: 0.015, updated: "2026-05-15" },
    { name: "gpt-4o", version: "2024-12", provider: "openai", status: "downloaded", contextWindow: 128000, cost: 0.012, updated: "2026-05-12" },
    { name: "llama-3-70b", version: "70b-instruct", provider: "meta", status: "available", contextWindow: 32000, cost: 0, updated: "2026-04-30" },
  ]);
  let lastPulled = $state<string | null>(null);

  function pull(name: string): void {
    models = models.map((m) => (m.name === name ? { ...m, status: "pulling" } : m));
    queueMicrotask(() => {
      models = models.map((m) => (m.name === name ? { ...m, status: "downloaded" } : m));
      lastPulled = name;
    });
  }
</script>

<svelte:head><title>Inference models | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-inference-models-page>
  <h1 class="text-2xl font-semibold">Inference models</h1>

  <table class="w-full text-sm" data-model-table>
    <thead>
      <tr class="text-left text-xs text-muted-foreground">
        <th>Name</th><th>Version</th><th>Provider</th><th>Status</th><th>Context</th><th>Cost / 1k</th><th>Updated</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#each models as m}
        <tr data-model-row={m.name} data-model-status={m.status}>
          <td data-model-name>{m.name}</td>
          <td>{m.version}</td>
          <td>{m.provider}</td>
          <td data-model-status-label>{m.status}</td>
          <td>{m.contextWindow.toLocaleString()}</td>
          <td>${m.cost.toFixed(4)}</td>
          <td>{m.updated}</td>
          <td>
            {#if m.status === "available"}
              <button type="button" data-model-pull={m.name} onclick={() => pull(m.name)} class="rounded-md border border-border px-2 py-0.5 text-xs">Pull</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if lastPulled}
    <p data-model-last-pulled class="text-xs text-primary">Pulled {lastPulled}.</p>
  {/if}
</main>
