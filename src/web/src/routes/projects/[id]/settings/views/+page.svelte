<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  const { data }: Props = $props();
</script>

<section data-saved-views-settings class={cn("flex flex-col gap-4")}>
  <header class={cn("flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <a href="/projects/{data.project.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Views</h1>
      <p class={cn("text-sm text-muted-foreground")}>{data.project.name}</p>
    </div>
  </header>

  {#if data.views.length === 0}
    <p data-saved-views-empty class={cn("text-sm text-muted-foreground")}>No saved views.</p>
  {:else}
    <div class={cn("overflow-hidden rounded-md border border-border")}>
      <table class={cn("w-full text-sm")}>
        <thead class={cn("bg-muted text-muted-foreground")}>
          <tr>
            <th class={cn("px-3 py-2 text-left font-medium")}>Name</th>
            <th class={cn("px-3 py-2 text-left font-medium")}>Scope</th>
            <th class={cn("px-3 py-2 text-left font-medium")}>Type</th>
            <th class={cn("px-3 py-2 text-left font-medium")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.views as view (view.id)}
            <tr data-saved-view-row={view.id} class={cn("border-t border-border")}>
              <td class={cn("px-3 py-2 font-medium")}>
                {view.name}
                {#if view.defaultFor}
                  <span class={cn("ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground")}>Default</span>
                {/if}
              </td>
              <td class={cn("px-3 py-2")}>
                <span data-saved-view-scope class={cn("rounded-md border border-border px-2 py-0.5 text-xs")}>{view.scope}</span>
              </td>
              <td class={cn("px-3 py-2 text-muted-foreground")}>{view.viewType}</td>
              <td class={cn("px-3 py-2")}>
                <div class={cn("flex flex-wrap gap-2")}>
                  <form method="POST" action="?/savedView">
                    <input type="hidden" name="intent" value="savedViews.setDefault" />
                    <input type="hidden" name="id" value={view.id} />
                    <input type="hidden" name="context" value="tasks" />
                    <button class={cn("h-8 rounded-md border border-input px-2 text-xs font-medium")} type="submit">Set default</button>
                  </form>
                  <form method="POST" action="?/savedView" class={cn("flex gap-1")}>
                    <input type="hidden" name="intent" value="savedViews.updateScope" />
                    <input type="hidden" name="id" value={view.id} />
                    <select name="scope" class={cn("h-8 rounded-md border border-input bg-background px-2 text-xs")}>
                      {#each ["private", "project", "org"] as scope}
                        <option value={scope} selected={view.scope === scope}>{scope}</option>
                      {/each}
                    </select>
                    <button class={cn("h-8 rounded-md border border-input px-2 text-xs font-medium")} type="submit">Share</button>
                  </form>
                  <form method="POST" action="?/savedView">
                    <input type="hidden" name="intent" value="savedViews.delete" />
                    <input type="hidden" name="id" value={view.id} />
                    <button class={cn("h-8 rounded-md border border-destructive px-2 text-xs font-medium text-destructive")} type="submit">Delete</button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
