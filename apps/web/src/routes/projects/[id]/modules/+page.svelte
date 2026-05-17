<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("mb-4 flex items-baseline justify-between gap-4 border-b border-border pb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href={`/projects/${data.projectId}`} class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Modules</h1>
  </div>
</header>

<form method="POST" action="?/create" use:enhance data-create-module-form class={cn("mb-6 grid gap-3 md:grid-cols-[1fr_160px_1fr_auto]")}>
  <input name="name" data-module-name required placeholder="Module name" class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm")} />
  <select name="status" data-module-status class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm")}>
    <option value="planned">Planned</option>
    <option value="active">Active</option>
    <option value="completed">Completed</option>
    <option value="archived">Archived</option>
  </select>
  <input name="leadUserId" data-module-lead placeholder="Lead user id" class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm")} />
  <button type="submit" data-create-module-submit class={cn("bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium")}>Create</button>
</form>

{#await data.streamed.data}
  <p class={cn("text-sm text-muted-foreground")}>Loading modules...</p>
{:then payload}
  {#if payload.modules.length === 0}
    <p data-empty-modules class={cn("text-sm text-muted-foreground")}>No modules yet.</p>
  {:else}
    <table data-modules-table class={cn("w-full text-sm")}>
      <thead>
        <tr class={cn("border-b border-border text-left")}>
          <th class={cn("py-2 pr-4 font-medium")}>Name</th>
          <th class={cn("py-2 pr-4 font-medium")}>Status</th>
          <th class={cn("py-2 pr-4 font-medium")}>Trace</th>
          <th class={cn("py-2 font-medium")}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each payload.modules as module (module.id)}
          <tr data-module-row class={cn("border-b border-border")}>
            <td class={cn("py-2 pr-4")}><a class={cn("hover:underline")} href={`/projects/${data.projectId}/modules/${module.id}`}>{module.name}</a></td>
            <td class={cn("py-2 pr-4")}>{module.status}</td>
            <td class={cn("py-2 pr-4 font-mono text-xs")}>{module.traceId}</td>
            <td class={cn("py-2")}>
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="moduleId" value={module.id} />
                <button type="submit" data-delete-module class={cn("text-xs text-destructive hover:underline")}>Delete</button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/await}
