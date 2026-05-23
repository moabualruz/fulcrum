<script lang="ts">
  interface ProjectRow {
    id: string;
    name: string;
    progressPct: number;
    activeSprint?: string | null;
    overdueCount: number;
    health: "green" | "amber" | "red";
    totalTasks: number;
    completedTasks: number;
  }

  interface Props {
    rows?: ProjectRow[];
    loading?: boolean;
  }

  let { rows = [], loading = false }: Props = $props();

  const healthConfig: Record<string, { label: string; classes: string }> = {
    green: { label: "On track", classes: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    amber: { label: "At risk", classes: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    red: { label: "Behind", classes: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  };
</script>

<div data-testid="portfolio-table" class="portfolio-table w-full overflow-hidden rounded-lg border">
  <table class="w-full text-sm">
    <thead class="bg-muted/50">
      <tr>
        <th class="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
        <th class="px-4 py-3 text-left font-medium text-muted-foreground">Progress</th>
        <th class="px-4 py-3 text-left font-medium text-muted-foreground">Sprint</th>
        <th class="px-4 py-3 text-left font-medium text-muted-foreground">Overdue</th>
        <th class="px-4 py-3 text-left font-medium text-muted-foreground">Health</th>
        <th class="px-4 py-3 text-left font-medium text-muted-foreground">Tasks</th>
      </tr>
    </thead>
    <tbody>
      {#if loading}
        {#each { length: 3 } as _, i (i)}
          <tr class="border-t animate-pulse">
            <td colspan="6" class="px-4 py-3">
              <div class="h-4 bg-muted rounded w-3/4"></div>
            </td>
          </tr>
        {/each}
      {:else if rows.length === 0}
        <tr class="border-t">
          <td colspan="6" class="px-4 py-8 text-center text-muted-foreground">
            No projects found in this workspace.
          </td>
        </tr>
      {:else}
        {#each rows as row (row.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="px-4 py-3 font-medium">{row.name}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <!-- Progress bar -->
                <div class="h-2 w-24 rounded-full bg-muted overflow-hidden">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    style="width: {Math.min(100, row.progressPct)}%"
                  ></div>
                </div>
                <span class="text-xs text-muted-foreground">{Math.round(row.progressPct)}%</span>
              </div>
            </td>
            <td class="px-4 py-3 text-muted-foreground">
              {row.activeSprint ?? '-'}
            </td>
            <td class="px-4 py-3">
              {#if row.overdueCount > 0}
                <span class="text-red-600 font-medium">{row.overdueCount}</span>
              {:else}
                <span class="text-muted-foreground">0</span>
              {/if}
            </td>
            <td class="px-4 py-3">
              <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {healthConfig[row.health]?.classes}">
                {healthConfig[row.health]?.label ?? row.health}
              </span>
            </td>
            <td class="px-4 py-3 text-muted-foreground">
              {row.completedTasks}/{row.totalTasks}
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
