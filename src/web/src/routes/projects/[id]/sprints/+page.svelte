<script lang="ts">
  import type { SprintListing } from "$lib/product-queries";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface VelocityPoint { sprintName: string; points: number }

  interface Props {
    data: {
      projectId: string;
      streamed: {
        data: Promise<{ sprints: SprintListing[]; velocity: VelocityPoint[] }> | { sprints: SprintListing[]; velocity: VelocityPoint[] };
      };
    };
  }
  const { data }: Props = $props();

  let resolvedSprints = $state<SprintListing[]>([]);
  let resolvedVelocity = $state<VelocityPoint[]>([]);

  {
    const d = data.streamed.data;
    if (!(d instanceof Promise)) {
      resolvedSprints = d.sprints;
      resolvedVelocity = d.velocity;
    }
  }

  $effect(() => {
    const d = data.streamed.data;
    if (d instanceof Promise) {
      let cancelled = false;
      void d.then((p) => {
        if (!cancelled) {
          resolvedSprints = p.sprints;
          resolvedVelocity = p.velocity;
        }
      });
      return () => { cancelled = true; };
    } else {
      resolvedSprints = d.sprints;
      resolvedVelocity = d.velocity;
    }
  });

  const planned = $derived(resolvedSprints.filter((s) => s.status === "planned"));
  const active = $derived(resolvedSprints.filter((s) => s.status === "active"));
  const completed = $derived(resolvedSprints.filter((s) => s.status === "completed"));

  // Velocity sparkline: simple inline SVG bar chart
  const maxVelocity = $derived(Math.max(1, ...resolvedVelocity.map((v) => v.points)));

  let showCreate = $state(false);
</script>

<header data-sprints-header class={cn("flex items-center justify-between border-b border-border pb-3 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Sprints</h1>
  </div>
  <button
    type="button"
    data-new-sprint-btn
    onclick={() => { showCreate = !showCreate; }}
    class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs")}
  >New Sprint</button>
</header>

{#if showCreate}
  <form method="POST" action="?/createSprint" data-create-sprint-form class={cn("mb-6 rounded-lg border border-border p-4 max-w-lg")}>
    <div class={cn("mb-3")}>
      <label for="sprint-name" class={cn("block text-sm font-medium mb-1")}>Name</label>
      <input id="sprint-name" name="name" type="text" required maxlength="120"
        class={cn("border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")} />
    </div>
    <div class={cn("mb-3")}>
      <label for="sprint-goal" class={cn("block text-sm font-medium mb-1")}>Goal</label>
      <input id="sprint-goal" name="goal" type="text"
        class={cn("border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")} />
    </div>
    <div class={cn("mb-3")}>
      <label for="sprint-capacity" class={cn("block text-sm font-medium mb-1")}>Capacity (points)</label>
      <input id="sprint-capacity" name="capacity" type="number" min="0" value="0"
        class={cn("border-input bg-background h-9 w-32 rounded-md border px-3 py-1 text-sm shadow-xs")} />
    </div>
    <button type="submit" class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs")}>Create</button>
  </form>
{/if}

{#await data.streamed.data}
  <RouteSkeleton kind="table" />
{:then _payload}
  <!-- Velocity sparkline -->
  {#if resolvedVelocity.length > 0}
    <section data-velocity-chart class={cn("mb-6")}>
      <h2 class={cn("text-sm font-medium text-muted-foreground mb-2")}>Velocity (completed sprints)</h2>
      <svg width="200" height="48" role="img" aria-label="Velocity sparkline">
        {#each resolvedVelocity as point, i}
          {@const barW = Math.floor(180 / resolvedVelocity.length) - 2}
          {@const barH = Math.max(2, (point.points / maxVelocity) * 40)}
          <rect
            x={i * (barW + 2) + 10}
            y={48 - barH - 4}
            width={barW}
            height={barH}
            fill="currentColor"
            class="text-primary"
          >
            <title>{point.sprintName}: {point.points} pts</title>
          </rect>
        {/each}
      </svg>
    </section>
  {/if}

  <!-- Active sprints -->
  {#if active.length > 0}
    <section class={cn("mb-6")}>
      <h2 class={cn("text-lg font-semibold mb-2")}>Active</h2>
      {#each active as sprint (sprint.id)}
        <div data-sprint-card data-sprint-status="active" class={cn("rounded-lg border border-primary/30 bg-primary/5 p-4 mb-2")}>
          <div class={cn("flex items-center justify-between")}>
            <a href="/projects/{data.projectId}/sprint/{sprint.id}" class={cn("text-base font-medium hover:underline")}>{sprint.name}</a>
            <form method="POST" action="?/completeSprint" class={cn("inline")}>
              <input type="hidden" name="id" value={sprint.id} />
              <button type="submit" data-complete-sprint-btn class={cn("text-xs text-primary hover:underline")}>Complete</button>
            </form>
          </div>
          {#if sprint.goal}<p class={cn("text-sm text-muted-foreground mt-1")}>{sprint.goal}</p>{/if}
          <p class={cn("text-xs text-muted-foreground mt-1")}>{sprint.task_count} tasks · {sprint.total_estimate} pts</p>
        </div>
      {/each}
    </section>
  {/if}

  <!-- Planned sprints -->
  {#if planned.length > 0}
    <section class={cn("mb-6")}>
      <h2 class={cn("text-lg font-semibold mb-2")}>Planned</h2>
      {#each planned as sprint (sprint.id)}
        <div data-sprint-card data-sprint-status="planned" class={cn("rounded-lg border border-border p-4 mb-2")}>
          <div class={cn("flex items-center justify-between")}>
            <span class={cn("text-base font-medium")}>{sprint.name}</span>
            <form method="POST" action="?/startSprint" class={cn("inline")}>
              <input type="hidden" name="id" value={sprint.id} />
              <button type="submit" data-start-sprint-btn class={cn("text-xs text-primary hover:underline")}>Start Sprint</button>
            </form>
          </div>
          {#if sprint.goal}<p class={cn("text-sm text-muted-foreground mt-1")}>{sprint.goal}</p>{/if}
          <p class={cn("text-xs text-muted-foreground mt-1")}>{sprint.task_count} tasks · {sprint.total_estimate} / {sprint.capacity} pts</p>
        </div>
      {/each}
    </section>
  {/if}

  <!-- Completed sprints -->
  {#if completed.length > 0}
    <section class={cn("mb-6")}>
      <h2 class={cn("text-lg font-semibold mb-2")}>Completed</h2>
      {#each completed as sprint (sprint.id)}
        <div data-sprint-card data-sprint-status="completed" class={cn("rounded-lg border border-border/50 bg-muted/20 p-4 mb-2")}>
          <span class={cn("text-base font-medium text-muted-foreground")}>{sprint.name}</span>
          <p class={cn("text-xs text-muted-foreground mt-1")}>{sprint.task_count} tasks · {sprint.total_estimate} pts</p>
        </div>
      {/each}
    </section>
  {/if}

  {#if resolvedSprints.length === 0}
    <p class={cn("py-8 text-center text-muted-foreground")}>No sprints yet. Click "New Sprint" to create one.</p>
  {/if}
{/await}
