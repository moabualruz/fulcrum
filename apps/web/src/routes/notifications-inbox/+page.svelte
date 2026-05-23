<script lang="ts">
  type Evidence = { kind: "task" | "doc" | "run" | "review"; id: string; label: string };
  type Notification = { id: string; ts: string; title: string; evidence: Evidence; read: boolean };

  let notifications = $state<Notification[]>([
    { id: "n1", ts: "10:00", title: "Task FUL-202 assigned to you", evidence: { kind: "task", id: "FUL-202", label: "Cycle save refactor" }, read: false },
    { id: "n2", ts: "10:05", title: "Doc 'Runbook' was updated", evidence: { kind: "doc", id: "doc-12", label: "Runbook" }, read: false },
    { id: "n3", ts: "10:09", title: "Run r-431 failed", evidence: { kind: "run", id: "r-431", label: "Build" }, read: true },
    { id: "n4", ts: "10:10", title: "Review thread reopened", evidence: { kind: "review", id: "rev-9", label: "Schema PR" }, read: false },
  ]);
  let openedEvidence = $state<string | null>(null);

  function open(id: string): void {
    notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    const n = notifications.find((x) => x.id === id);
    openedEvidence = n ? `${n.evidence.kind}:${n.evidence.id}` : null;
  }
</script>

<svelte:head><title>Notifications inbox | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-notif-inbox-page>
  <h1 class="text-2xl font-semibold">Notifications inbox</h1>

  <ul class="space-y-2" data-notif-inbox-list>
    {#each notifications as n}
      <li data-notif-inbox-row={n.id} data-notif-inbox-read={n.read} class="rounded-md border border-border p-3">
        <button type="button" data-notif-inbox-open={n.id} onclick={() => open(n.id)} class="block w-full text-left">
          <p class="text-sm font-medium">{n.title}</p>
          <p class="text-xs text-muted-foreground">{n.ts} · evidence: <span data-notif-inbox-evidence={n.id}>{n.evidence.kind}:{n.evidence.id}</span> · {n.evidence.label}</p>
        </button>
      </li>
    {/each}
  </ul>

  {#if openedEvidence}
    <p data-notif-inbox-opened class="text-xs text-primary">Linked to evidence {openedEvidence}</p>
  {/if}
</main>
