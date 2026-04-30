<script lang="ts">
  import { setActiveProject } from "$lib/state/fulcrum-store";
  let { data } = $props();
</script>

<h1 class="text-xl font-semibold mb-4">Projects</h1>

{#if data.projects.length === 0}
  <p class="text-sm text-muted-foreground">No projects yet. Run <code class="font-mono">fulcrum product init</code>.</p>
{:else}
  <div class="grid gap-3 md:grid-cols-2">
    {#each data.projects as project (project.id)}
      <article class="rounded-lg border border-border p-4">
        <header class="flex items-center gap-2">
          <h2 class="font-semibold">{project.name}</h2>
          <span class="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">{project.slug}</span>
        </header>
        {#if project.description}
          <p class="mt-1 text-sm text-muted-foreground">{project.description}</p>
        {/if}
        <button
          class="mt-3 text-xs underline"
          onclick={() => setActiveProject(project.id)}
        >set active</button>
      </article>
    {/each}
  </div>
{/if}
