<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn, Select } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("mb-4 flex items-baseline gap-3 border-b border-border pb-4")}>
  <a href={`/projects/${data.projectId}/settings/views`} class={cn("text-sm text-muted-foreground hover:underline")}>← Views</a>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.view.name}</h1>
  {#if data.view.traceId}
    <span data-view-trace class={cn("font-mono text-xs text-muted-foreground")}>{data.view.traceId}</span>
  {/if}
</header>

<form method="POST" action="?/update" use:enhance data-view-detail-form class={cn("max-w-xl space-y-4")}>
  <label class={cn("block text-sm font-medium")} for="view-name">Name</label>
  <input id="view-name" name="name" data-view-name value={data.view.name} class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")} />
  <label class={cn("block text-sm font-medium")} for="view-scope">Scope</label>
  <select id="view-scope" name="scope" data-view-scope class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")}>
    {#each ["project", "org", "private"] as scope}
      <option value={scope} selected={data.view.scope === scope}>{scope}</option>
    {/each}
  </select>
  <label class={cn("block text-sm font-medium")} for="view-type">View type</label>
  <select id="view-type" name="viewType" data-view-type class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")}>
    {#each ["list", "kanban", "table", "calendar", "timeline"] as viewType}
      <option value={viewType} selected={data.view.viewType === viewType}>{viewType}</option>
    {/each}
  </select>
  <label class={cn("block text-sm font-medium")} for="view-sort">Sort</label>
  <input id="view-sort" name="sortBy" data-view-sort value={data.view.sortBy ?? ""} class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")} />
  <div class={cn("flex items-center gap-2")}>
    <input id="view-default" name="isDefault" type="checkbox" checked={data.view.isDefault} />
    <label for="view-default" class={cn("text-sm")}>Default view</label>
  </div>
  <pre data-view-filters class={cn("overflow-auto rounded-md border border-border bg-muted p-3 text-xs")}>{JSON.stringify(data.view.filters, null, 2)}</pre>
  <button type="submit" data-view-save class={cn("bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium")}>Save</button>
</form>
