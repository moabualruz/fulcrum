<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";

  interface TileData {
    id: string;
    name: string;
    openTasks: number;
    lastActivity: string | null;
  }

  interface Props {
    tiles: TileData[];
  }

  const { tiles }: Props = $props();
</script>

<section data-project-tiles class={cn("space-y-2")}>
  <h3 class={cn("text-sm font-semibold tracking-tight")}>Projects</h3>
  {#if tiles.length === 0}
    <div data-project-tiles-empty class={cn("text-sm text-muted-foreground")}>
      No projects yet.
    </div>
  {:else}
    <div class={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
      {#each tiles as tile (tile.id)}
        <a
          data-project-tile
          data-project-id={tile.id}
          href="/projects/{tile.id}"
          class={cn(
            "block rounded-lg border border-border bg-card p-4 shadow-xs",
            "hover:bg-accent/50 transition-colors",
          )}
        >
          <div class={cn("font-medium")}>{tile.name}</div>
          <div data-open-tasks class={cn("text-sm text-muted-foreground mt-1")}>
            {tile.openTasks} open task{tile.openTasks === 1 ? "" : "s"}
          </div>
        </a>
      {/each}
    </div>
  {/if}
</section>
