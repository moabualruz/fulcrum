<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("mb-4 flex items-baseline gap-3 border-b border-border pb-4")}>
  <a href={`/projects/${data.projectId}/modules`} class={cn("text-sm text-muted-foreground hover:underline")}>← Modules</a>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>{data.module.name}</h1>
  <span data-module-trace class={cn("font-mono text-xs text-muted-foreground")}>{data.module.traceId}</span>
</header>

<form method="POST" action="?/update" use:enhance data-module-detail-form class={cn("max-w-xl space-y-4")}>
  <label class={cn("block text-sm font-medium")} for="module-name">Name</label>
  <input id="module-name" name="name" data-module-name value={data.module.name} class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")} />
  <label class={cn("block text-sm font-medium")} for="module-status">Status</label>
  <select id="module-status" name="status" data-module-status class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")}>
    {#each ["planned", "active", "completed", "archived"] as status}
      <option value={status} selected={data.module.status === status}>{status}</option>
    {/each}
  </select>
  <label class={cn("block text-sm font-medium")} for="module-lead">Lead user</label>
  <input id="module-lead" name="leadUserId" data-module-lead value={data.module.leadUserId ?? ""} class={cn("border-input bg-background h-9 w-full rounded-md border px-3 text-sm")} />
  <button type="submit" data-module-save class={cn("bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium")}>Save</button>
</form>
