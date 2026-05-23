<script lang="ts">
  type Classification = "transient" | "terminal" | "unknown";
  type Event = { id: string; ts: string; error: string; classification: Classification; retried: boolean };

  let events = $state<Event[]>([
    { id: "ev1", ts: "10:01", error: "ETIMEDOUT connecting to api", classification: "transient", retried: true },
    { id: "ev2", ts: "10:02", error: "429 rate limited", classification: "transient", retried: true },
    { id: "ev3", ts: "10:03", error: "401 invalid token", classification: "terminal", retried: false },
    { id: "ev4", ts: "10:04", error: "unexpected stream chunk", classification: "unknown", retried: false },
  ]);
  let budget = $state(5);
  const used = $derived(events.filter((e) => e.retried).length);
  const remaining = $derived(Math.max(0, budget - used));

  function reclassify(id: string, c: Classification): void {
    events = events.map((e) => (e.id === id ? { ...e, classification: c, retried: c === "transient" && remaining > 0 } : e));
  }

  function increaseBudget(): void { budget += 1; }
</script>

<svelte:head><title>Retry policy | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-retry-policy-page>
  <h1 class="text-2xl font-semibold">Smart retry policy</h1>

  <p class="text-sm">Retry budget: <span data-retry-budget>{budget}</span> · used <span data-retry-used>{used}</span> · remaining <span data-retry-remaining>{remaining}</span></p>
  <button type="button" data-retry-budget-increase onclick={increaseBudget} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Increase budget</button>

  <ul class="space-y-2" data-retry-events>
    {#each events as e}
      <li data-retry-event={e.id} data-retry-class={e.classification} data-retry-retried={e.retried} class="space-y-1 rounded-md border border-border p-3">
        <p class="text-sm">{e.ts} · {e.error}</p>
        <p class="text-xs text-muted-foreground">
          Class: <span data-retry-event-class>{e.classification}</span> · retried: <span data-retry-event-retried>{e.retried ? "yes" : "no"}</span>
        </p>
        <div class="flex gap-1 text-xs">
          {#each ["transient", "terminal", "unknown"] as c}
            <button type="button" data-retry-reclassify={`${e.id}:${c}`} onclick={() => reclassify(e.id, c as Classification)} class="rounded-md border border-border px-2 py-0.5">{c}</button>
          {/each}
        </div>
      </li>
    {/each}
  </ul>
</main>
