<script lang="ts">
  /**
   * ResourceAllocation.svelte — Cross-project team allocation table (workflow milestone, D-96).
   *
   * Shows team members × projects × allocated points.
   * >100% row indicates over-allocation (highlighted).
   */

  interface ProjectAllocation {
    name: string;
    points: number;
  }

  interface MemberRow {
    member: string;
    projects: ProjectAllocation[];
    /** Optional: total capacity points. Default 100. */
    capacity?: number;
  }

  interface Props {
    data?: MemberRow[];
    loading?: boolean;
  }

  let { data = [], loading = false }: Props = $props();

  // Collect all unique project names
  const allProjects = $derived(() => {
    const names = new Set<string>();
    for (const row of data) {
      for (const p of row.projects) names.add(p.name);
    }
    return [...names].sort();
  });

  function totalPoints(member: MemberRow): number {
    return member.projects.reduce((sum, p) => sum + p.points, 0);
  }

  function allocationPct(member: MemberRow): number {
    const cap = member.capacity ?? 100;
    return Math.round((totalPoints(member) / cap) * 100);
  }

  function getProjectPoints(member: MemberRow, projectName: string): number {
    return member.projects.find((p) => p.name === projectName)?.points ?? 0;
  }
</script>

<div data-testid="resource-allocation" class="resource-allocation w-full overflow-x-auto rounded-lg border">
  {#if loading}
    <div class="p-8 text-center text-muted-foreground animate-pulse">Loading allocation data…</div>
  {:else if data.length === 0}
    <div class="p-8 text-center text-muted-foreground">No allocation data available.</div>
  {:else}
    <table class="w-full text-sm">
      <thead class="bg-muted/50">
        <tr>
          <th class="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Team Member</th>
          {#each allProjects() as project (project)}
            <th class="px-3 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{project}</th>
          {/each}
          <th class="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
          <th class="px-4 py-3 text-left font-medium text-muted-foreground">Allocation</th>
        </tr>
      </thead>
      <tbody>
        {#each data as row (row.member)}
          {@const pct = allocationPct(row)}
          <tr class="border-t hover:bg-muted/30 transition-colors {pct > 100 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}">
            <td class="px-4 py-3 font-medium whitespace-nowrap">{row.member}</td>
            {#each allProjects() as project (project)}
              {@const pts = getProjectPoints(row, project)}
              <td class="px-3 py-3 text-muted-foreground">
                {#if pts > 0}
                  <span class="font-medium text-foreground">{pts}</span>
                {:else}
                  <span class="text-muted-foreground/50">—</span>
                {/if}
              </td>
            {/each}
            <td class="px-4 py-3 font-medium">{totalPoints(row)}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {
                  pct > 100
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : pct > 80
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                }"
              >
                {pct}%
              </span>
              {#if pct > 100}
                <span class="ml-1 text-xs text-red-600">Over-allocated</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
