<script lang="ts">
  type Session = { id: string; title: string };
  let sessions = $state<Session[]>([]);

  function startSampleSession(): void {
    sessions = [{ id: "s1", title: "Sample session" }];
  }

  function clear(): void { sessions = []; }
</script>

<svelte:head><title>Sessions | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-sessions-empty-page>
  <h1 class="text-2xl font-semibold">Sessions</h1>

  {#if sessions.length === 0}
    <section data-sessions-empty class="space-y-3 rounded-md border border-dashed border-border p-8 text-center">
      <span data-sessions-empty-icon aria-hidden="true" class="text-3xl">▶</span>
      <h2 class="text-lg font-medium">No sessions yet</h2>
      <p class="text-sm text-muted-foreground">A session captures one agent run. Pick a task and start a run to see it here, with full transcript and tool calls.</p>
      <a data-sessions-empty-cta href="/tasks" class="inline-block rounded-md bg-primary px-4 py-2 text-xs text-primary-foreground">Start a Run</a>
      <button type="button" data-sessions-empty-add onclick={startSampleSession} class="block w-full text-xs text-muted-foreground underline">(simulate one)</button>
    </section>
  {:else}
    <ul class="space-y-2" data-sessions-list>
      {#each sessions as s}
        <li data-sessions-row={s.id} class="rounded-md border border-border p-3 text-sm">{s.title}</li>
      {/each}
    </ul>
    <button type="button" data-sessions-clear onclick={clear} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Clear</button>
  {/if}
</main>
