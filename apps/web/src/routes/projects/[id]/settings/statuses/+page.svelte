<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Statuses</h1>
  </div>
</header>

<form method="POST" action="?/create" use:enhance data-create-status-form class={cn("flex flex-col gap-3 max-w-xl mb-8")}>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="status-name" class={cn("text-sm font-medium")}>Status Name</label>
    <input id="status-name" name="name" type="text" required class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")} />
  </div>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="status-color" class={cn("text-sm font-medium")}>Color</label>
    <input id="status-color" name="color" type="color" value="#6b7280" class={cn("h-9 w-16 rounded-md border border-input")} />
  </div>
  <div class={cn("flex items-center gap-2")}>
    <input id="status-final" name="isFinal" type="checkbox" />
    <label for="status-final" class={cn("text-sm")}>Mark as final (done) state</label>
  </div>
  <button type="submit" data-create-status-submit class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs w-fit")}>Add Status</button>
</form>

{#if data.statuses.length === 0}
  <p data-empty-statuses class={cn("text-muted-foreground text-sm")}>No custom statuses yet.</p>
{:else}
  <table data-statuses-table class={cn("w-full text-sm")}>
    <thead>
      <tr class={cn("border-b border-border text-left")}>
        <th class={cn("py-2 pr-4 font-medium")}>Color</th>
        <th class={cn("py-2 pr-4 font-medium")}>Name</th>
        <th class={cn("py-2 pr-4 font-medium")}>Final</th>
        <th class={cn("py-2 font-medium")}>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.statuses as status (status.id)}
        <tr data-status-row class={cn("border-b border-border")}>
          <td class={cn("py-2 pr-4")}>
            <span class={cn("inline-block w-4 h-4 rounded-full")} style="background-color: {status.color}"></span>
          </td>
          <td class={cn("py-2 pr-4")}>{status.name}</td>
          <td class={cn("py-2 pr-4")}>{status.is_final ? "Yes" : "No"}</td>
          <td class={cn("py-2")}>
            <form method="POST" action="?/delete" use:enhance class={cn("inline")}>
              <input type="hidden" name="id" value={status.id} />
              <button type="submit" data-delete-status class={cn("text-xs text-destructive hover:underline")}>Delete</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
