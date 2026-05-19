<script lang="ts">
  type EventKind = "chat" | "tool" | "lock" | "error";
  type Event = { id: string; kind: EventKind; ts: string; summary: string };

  const EVENTS: Event[] = [
    { id: "e1", kind: "chat", ts: "10:00:01", summary: "User requested refactor" },
    { id: "e2", kind: "tool", ts: "10:00:05", summary: "read src/cycle.ts" },
    { id: "e3", kind: "lock", ts: "10:00:09", summary: "Approval requested for write" },
    { id: "e4", kind: "tool", ts: "10:00:11", summary: "write src/cycle.ts" },
    { id: "e5", kind: "error", ts: "10:00:18", summary: "Type error on line 12" },
    { id: "e6", kind: "chat", ts: "10:00:24", summary: "Assistant: fixed the typing issue" },
  ];

  const ICONS: Record<EventKind, string> = { chat: "💬", tool: "🛠", lock: "🔒", error: "⚠" };

  let expandedId = $state<string | null>(null);
  let scrolledTo = $state<string | null>(null);

  function toggle(id: string): void { expandedId = expandedId === id ? null : id; }
  function jumpTo(id: string): void { scrolledTo = id; }
</script>

<svelte:head><title>Session timeline | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-timeline-page>
  <h1 class="text-2xl font-semibold">Session timeline</h1>

  <ol class="space-y-2" data-timeline-list>
    {#each EVENTS as e}
      <li
        data-timeline-event={e.id}
        data-timeline-kind={e.kind}
        class="rounded-md border border-border p-3"
      >
        <button type="button" data-timeline-toggle={e.id} onclick={() => toggle(e.id)} class="flex w-full items-center justify-between gap-3 text-left">
          <span class="flex items-center gap-2">
            <span data-timeline-icon={e.kind} aria-hidden="true">{ICONS[e.kind]}</span>
            <span class="text-sm">{e.summary}</span>
          </span>
          <span data-timeline-time class="text-xs text-muted-foreground">{e.ts}</span>
        </button>
        {#if expandedId === e.id}
          <div data-timeline-detail class="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>Event id: {e.id}</p>
            <p>Kind: {e.kind}</p>
            <button type="button" data-timeline-jump={e.id} onclick={() => jumpTo(e.id)} class="rounded-md border border-border bg-background px-2 py-0.5">Jump to chat message</button>
          </div>
        {/if}
      </li>
    {/each}
  </ol>

  {#if scrolledTo}
    <p data-timeline-scrolled class="text-xs text-primary">Chat scrolled to {scrolledTo}</p>
  {/if}
</main>
