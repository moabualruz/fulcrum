<script lang="ts">
  import { Button, EmptyState } from "@fulcrum/ui-kit";

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
    <EmptyState
      data-sessions-empty
      title="No sessions yet"
      description="A session captures one agent run. Pick a task and start a run to see it here, with full transcript and tool calls."
    >
      {#snippet icon()}
        <span data-sessions-empty-icon>▶</span>
      {/snippet}
      {#snippet actions()}
        <Button size="sm" data-sessions-empty-cta href="/tasks">Start a Run</Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          data-sessions-empty-add
          onclick={startSampleSession}
        >
          simulate one
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="space-y-2" data-sessions-list>
      {#each sessions as s}
        <li data-sessions-row={s.id} class="rounded-md border border-border p-3 text-sm">{s.title}</li>
      {/each}
    </ul>
    <Button variant="outline" size="sm" data-sessions-clear onclick={clear}>Clear</Button>
  {/if}
</main>
