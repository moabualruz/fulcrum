<script lang="ts">
  let { data } = $props();

  function statusClass(status: string): string {
    if (status === "succeeded") return "bg-primary text-primary-foreground";
    if (status === "failed" || status === "cancelled") return "bg-destructive text-destructive-foreground";
    return "bg-muted text-foreground";
  }
</script>

<h1 class="text-xl font-semibold mb-4">Agent runs</h1>

{#if data.runs.length === 0}
  <p class="text-sm text-muted-foreground">No agent runs recorded.</p>
{:else}
  <table class="w-full text-sm">
    <thead class="text-left">
      <tr class="border-b border-border">
        <th class="py-2">agent</th>
        <th class="py-2">model</th>
        <th class="py-2">status</th>
        <th class="py-2">started</th>
        <th class="py-2">ended</th>
      </tr>
    </thead>
    <tbody>
      {#each data.runs as run (run.id)}
        <tr class="border-b border-border">
          <td class="py-2">{run.agent}</td>
          <td class="py-2">{run.model ?? "—"}</td>
          <td class="py-2">
            <span class="rounded px-2 py-0.5 text-xs {statusClass(run.status)}">{run.status}</span>
          </td>
          <td class="py-2 text-xs text-muted-foreground">{run.started_at}</td>
          <td class="py-2 text-xs text-muted-foreground">{run.ended_at ?? "—"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
