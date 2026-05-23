<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn, Select } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Saved Views</h1>
  </div>
</header>

<form method="POST" action="?/create" use:enhance data-create-view-form class={cn("flex flex-col gap-3 max-w-xl mb-8")}>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="view-name" class={cn("text-sm font-medium")}>View Name</label>
    <input id="view-name" name="name" type="text" required class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")} />
  </div>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="view-scope" class={cn("text-sm font-medium")}>Scope</label>
    <select id="view-scope" name="scope" class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")}>
      <option value="project">Project</option>
      <option value="org">Organization</option>
      <option value="private">Private</option>
    </select>
  </div>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="view-filters" class={cn("text-sm font-medium")}>Filters (JSON)</label>
    <textarea id="view-filters" name="filters" rows="3" placeholder={"{\"status\": \"pending\", \"priority\": \"high\"}"} class={cn("border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm")}></textarea>
  </div>
  <div class={cn("flex items-center gap-2")}>
    <input id="view-default" name="isDefault" type="checkbox" />
    <label for="view-default" class={cn("text-sm")}>Set as default view</label>
  </div>
  <button type="submit" data-create-view-submit class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs w-fit")}>Save View</button>
</form>

{#if data.views.length === 0}
  <p data-empty-views class={cn("text-muted-foreground text-sm")}>No saved views yet.</p>
{:else}
  <table data-views-table class={cn("w-full text-sm")}>
    <thead>
      <tr class={cn("border-b border-border text-left")}>
        <th class={cn("py-2 pr-4 font-medium")}>Name</th>
        <th class={cn("py-2 pr-4 font-medium")}>Scope</th>
        <th class={cn("py-2 pr-4 font-medium")}>Default</th>
        <th class={cn("py-2 font-medium")}>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.views as view (view.id)}
        <tr data-view-row class={cn("border-b border-border")}>
          <td class={cn("py-2 pr-4")}>
            <a href={`/projects/${data.projectId}/settings/views/${view.id}`} class={cn("hover:underline")}>{view.name}</a>
          </td>
          <td class={cn("py-2 pr-4")}>{view.scope}</td>
          <td class={cn("py-2 pr-4")}>{view.is_default ? "Yes" : "No"}</td>
          <td class={cn("py-2")}>
            <form method="POST" action="?/delete" use:enhance class={cn("inline")}>
              <input type="hidden" name="id" value={view.id} />
              <button type="submit" data-delete-view class={cn("text-xs text-destructive hover:underline")}>Delete</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
