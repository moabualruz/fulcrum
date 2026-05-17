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
  <a href={`/projects/${data.projectId}`} class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Intake</h1>
</header>

<form method="POST" action="?/create" use:enhance data-create-intake-form class={cn("mb-6 grid gap-3 md:grid-cols-[1fr_180px_auto]")}>
  <input name="title" data-intake-title required placeholder="Request title" class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm")} />
  <input name="source" data-intake-source placeholder="Source" value="manual" class={cn("border-input bg-background h-9 rounded-md border px-3 text-sm")} />
  <button type="submit" data-create-intake-submit class={cn("bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium")}>Add</button>
  <textarea name="description" data-intake-description placeholder="Description" class={cn("border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm md:col-span-3")}></textarea>
</form>

{#await data.streamed.data}
  <p class={cn("text-sm text-muted-foreground")}>Loading intake...</p>
{:then payload}
  {#if payload.intake.length === 0}
    <p data-empty-intake class={cn("text-sm text-muted-foreground")}>No intake requests yet.</p>
  {:else}
    <table data-intake-table class={cn("w-full text-sm")}>
      <thead>
        <tr class={cn("border-b border-border text-left")}>
          <th class={cn("py-2 pr-4 font-medium")}>Title</th>
          <th class={cn("py-2 pr-4 font-medium")}>Status</th>
          <th class={cn("py-2 pr-4 font-medium")}>Trace</th>
          <th class={cn("py-2 font-medium")}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each payload.intake as request (request.id)}
          <tr data-intake-row class={cn("border-b border-border")}>
            <td class={cn("py-2 pr-4")}><a href={`/projects/${data.projectId}/intake/${request.id}`} class={cn("hover:underline")}>{request.title}</a></td>
            <td class={cn("py-2 pr-4")}>{request.status}</td>
            <td class={cn("py-2 pr-4 font-mono text-xs")}>{request.traceId}</td>
            <td class={cn("py-2")}>
              <form method="POST" action="?/delete" use:enhance>
                <input type="hidden" name="intakeId" value={request.id} />
                <button type="submit" data-delete-intake class={cn("text-xs text-destructive hover:underline")}>Delete</button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/await}
