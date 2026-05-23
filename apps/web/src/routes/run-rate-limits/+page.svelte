<script lang="ts">
  type Event = { id: string; ts: string; status: number; retryAfter: number; backoff: number; auto: boolean };

  let events = $state<Event[]>([
    { id: "rl1", ts: "10:01:02", status: 429, retryAfter: 2, backoff: 2, auto: true },
    { id: "rl2", ts: "10:01:06", status: 429, retryAfter: 4, backoff: 4, auto: true },
    { id: "rl3", ts: "10:01:14", status: 429, retryAfter: 8, backoff: 8, auto: true },
  ]);
  let audit = $state<string[]>(events.map((e) => `auto-retry:${e.id}`));

  function forceRetry(id: string): void {
    audit = [...audit, `force-retry:${id}`];
  }
</script>

<svelte:head><title>Rate limit handling | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-rate-limit-page>
  <h1 class="text-2xl font-semibold">Rate-limit handling</h1>

  <ul class="space-y-2" data-rate-events>
    {#each events as e}
      <li data-rate-row={e.id} data-rate-status={e.status} class="space-y-1 rounded-md border border-border p-3 text-sm">
        <p>{e.ts} · <span data-rate-status-code>{e.status}</span> · retry-after <span data-rate-retry-after>{e.retryAfter}s</span> · backoff <span data-rate-backoff>{e.backoff}s</span> · auto: <span data-rate-auto>{e.auto ? "yes" : "no"}</span></p>
        <button type="button" data-rate-force={e.id} onclick={() => forceRetry(e.id)} class="rounded-md border border-border bg-background px-2 py-0.5 text-xs">Force retry</button>
      </li>
    {/each}
  </ul>

  <section data-rate-audit class="rounded-md border border-border p-3 text-xs">
    <h2 class="text-base font-medium">Audit</h2>
    <ul>
      {#each audit as entry}<li>{entry}</li>{/each}
    </ul>
  </section>
</main>
