<script lang="ts">
  let { data } = $props();
  const columns = ["pending", "in_progress", "blocked", "completed", "cancelled"] as const;
</script>

<h1 class="text-xl font-semibold mb-4">Board (read-only)</h1>

<div class="grid gap-3 md:grid-cols-5">
  {#each columns as status (status)}
    <section class="rounded-lg border border-border p-3">
      <header class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold">{status}</h2>
        <span class="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {(data.groups[status] ?? []).length}
        </span>
      </header>
      <div class="space-y-2">
        {#each data.groups[status] ?? [] as task (task.id)}
          <div class="rounded border border-border p-2 text-sm">
            <div>{task.title}</div>
            <div class="text-xs text-muted-foreground">priority {task.priority}</div>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</div>
