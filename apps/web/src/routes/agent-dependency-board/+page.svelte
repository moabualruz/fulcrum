<script lang="ts">
  type Status = "idle" | "running" | "blocked" | "done";
  type Task = { id: string; title: string; agent: string; status: Status; blockers: string[] };

  const AGENTS = ["claude", "codex", "gemini"];

  let tasks = $state<Task[]>([
    { id: "T1", title: "Plan migration", agent: "claude", status: "done", blockers: [] },
    { id: "T2", title: "Write tests", agent: "codex", status: "running", blockers: ["T1"] },
    { id: "T3", title: "Implement schema", agent: "gemini", status: "blocked", blockers: ["T1", "T2"] },
    { id: "T4", title: "Roll out", agent: "claude", status: "idle", blockers: ["T3"] },
  ]);
  let hovered = $state<string | null>(null);

  function reassign(id: string, agent: string): void {
    tasks = tasks.map((t) => (t.id === id ? { ...t, agent } : t));
  }
</script>

<svelte:head><title>Multi-agent board | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-4xl space-y-4 p-6" data-agent-board-page>
  <h1 class="text-2xl font-semibold">Multi-agent dependency board</h1>

  <ul class="grid gap-3 md:grid-cols-2" data-agent-board>
    {#each tasks as t}
      <li
        data-board-card={t.id}
        data-board-status={t.status}
        data-board-agent={t.agent}
        onmouseenter={() => (hovered = t.id)}
        onmouseleave={() => (hovered = null)}
        class="space-y-1 rounded-md border border-border p-3"
      >
        <p class="text-sm font-medium">{t.id} · {t.title}</p>
        <p class="text-xs text-muted-foreground">
          agent: <span data-board-agent-label>{t.agent}</span> · status: <span data-board-status-label>{t.status}</span>
        </p>
        <label class="flex items-center gap-2 text-xs">
          Reassign
          <select data-board-reassign={t.id} value={t.agent} onchange={(e) => reassign(t.id, (e.target as HTMLSelectElement).value)} class="rounded-md border border-border bg-background px-2 py-0.5">
            {#each AGENTS as a}<option value={a}>{a}</option>{/each}
          </select>
        </label>
        {#if hovered === t.id && t.blockers.length > 0}
          <p data-board-blockers class="text-xs text-destructive">Blockers: {t.blockers.join(", ")}</p>
        {/if}
      </li>
    {/each}
  </ul>
</main>
