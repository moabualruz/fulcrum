<script lang="ts">
  type Event = { id: string; kind: "user" | "assistant" | "tool"; summary: string };
  type Session = { id: string; title: string; parentId: string | null; forkPoint: string | null; events: Event[] };

  const ORIGINAL_EVENTS: Event[] = [
    { id: "e1", kind: "user", summary: "Plan refactor" },
    { id: "e2", kind: "assistant", summary: "Outlined approach" },
    { id: "e3", kind: "tool", summary: "Ran tests" },
    { id: "e4", kind: "assistant", summary: "Implemented change" },
  ];

  let sessions = $state<Session[]>([
    { id: "s1", title: "Refactor cycle save", parentId: null, forkPoint: null, events: ORIGINAL_EVENTS },
  ]);
  let activeId = $state<string>("s1");

  function eventsUpTo(eventId: string): Event[] {
    const idx = ORIGINAL_EVENTS.findIndex((e) => e.id === eventId);
    if (idx === -1) return ORIGINAL_EVENTS;
    return ORIGINAL_EVENTS.slice(0, idx + 1);
  }

  function fork(eventId: string): void {
    const parent = sessions.find((s) => s.id === activeId);
    if (!parent) return;
    const newId = `s${sessions.length + 1}`;
    sessions = [
      ...sessions,
      {
        id: newId,
        title: `${parent.title} (fork @ ${eventId})`,
        parentId: parent.id,
        forkPoint: eventId,
        events: eventsUpTo(eventId),
      },
    ];
  }

  function switchActive(id: string): void { activeId = id; }
</script>

<svelte:head><title>Session fork | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-fork-page>
  <h1 class="text-2xl font-semibold">Session fork</h1>

  <ul class="flex flex-wrap gap-2" data-session-tabs>
    {#each sessions as s}
      <li>
        <button
          type="button"
          data-session-tab={s.id}
          data-session-active={s.id === activeId}
          onclick={() => switchActive(s.id)}
          class="rounded-md border border-border bg-background px-3 py-1 text-xs"
        >
          {s.title}
        </button>
      </li>
    {/each}
  </ul>

  {#each sessions as s}
    {#if s.id === activeId}
      <section data-active-session-id={s.id} class="space-y-2 rounded-md border border-border p-3">
        <header>
          <h2 class="text-base font-medium">{s.title}</h2>
          {#if s.parentId}
            <p class="text-xs text-muted-foreground">Forked from <span data-session-parent>{s.parentId}</span> at <span data-session-fork-point>{s.forkPoint}</span></p>
          {/if}
        </header>
        <ul class="space-y-1">
          {#each s.events as event}
            <li data-event-row={event.id} class="flex items-center justify-between rounded-md border border-border p-2 text-sm">
              <span>{event.kind}: {event.summary}</span>
              <button type="button" data-event-fork={event.id} onclick={() => fork(event.id)} class="rounded-md border border-border px-2 py-0.5 text-xs">Fork here</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</main>
