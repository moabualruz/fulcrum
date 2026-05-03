<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import InContextSearchBar from "$lib/components/search/InContextSearchBar.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let addOpen = $state(false);
  let mode = $state<"local" | "remote">("local");

  function shortDate(value: string | null): string {
    return value ? value.slice(0, 10) : "Never";
  }
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <header data-repos-header class={cn("mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4")}>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Repos</h1>
    <button type="button" data-add-repo-trigger onclick={() => (addOpen = !addOpen)} class={cn(buttonVariants({ variant: "default" }))}>Add repo</button>
  </header>

  <div class={cn("mb-3")}>
    <InContextSearchBar kind="repo" projectId={data.activeProjectId} placeholder="Search repos" />
  </div>

  <section data-add-repo-modal hidden={!addOpen} class={cn("mb-4 rounded-md border border-border bg-background p-4")}>
      <form data-add-repo-form method="POST" action="?/add" use:enhance class={cn("grid gap-3 sm:grid-cols-2")}>
        <div class={cn("flex gap-2 sm:col-span-2")}>
          <label class={cn("inline-flex items-center gap-2 text-sm")}><input type="radio" name="kind" value="local" bind:group={mode} />Path</label>
          <label class={cn("inline-flex items-center gap-2 text-sm")}><input type="radio" name="kind" value="remote" bind:group={mode} />Remote URL</label>
        </div>
        <label class={cn("grid gap-1 text-sm")}>Path<input name="path" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
        <label class={cn("grid gap-1 text-sm")}>Remote URL<input name="url" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
        <label class={cn("grid gap-1 text-sm")}>Name<input name="name" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
        <label class={cn("grid gap-1 text-sm")}>Project<input name="projectId" class={cn("h-9 rounded-md border border-input bg-background px-3")} /></label>
        <div class={cn("sm:col-span-2")}>
          <button type="submit" class={cn(buttonVariants({ variant: "default" }))}>Save</button>
        </div>
      </form>
  </section>

  {#if payload.repos.length === 0}
    <div data-empty-repos class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No repos registered.</div>
  {:else}
    <div data-slot="table-container" class={cn("w-full overflow-x-auto")}>
      <table data-slot="table" class={cn("w-full caption-bottom text-sm")}>
        <thead><tr class={cn("border-b")}><th class={cn("h-10 px-2 text-left")}>Name</th><th class={cn("h-10 px-2 text-left")}>Kind</th><th class={cn("h-10 px-2 text-left")}>Sync</th><th class={cn("h-10 px-2 text-left")}>Last sync</th></tr></thead>
        <tbody>
          {#each payload.repos as repo (repo.id)}
            <tr data-repo-row data-repo-id={repo.id} class={cn("border-b hover:bg-muted/50")}>
              <td class={cn("p-2 font-medium")}><a href="/repos/{repo.id}" class={cn("hover:underline")}>{repo.name}</a><div class={cn("text-xs text-muted-foreground")}>{repo.slug}</div></td>
              <td class={cn("p-2")}><span data-repo-kind class={cn("rounded border border-border px-2 py-0.5 text-xs")}>{repo.kind}</span></td>
              <td class={cn("p-2")}><span data-sync-status data-status={repo.syncStatus} class={cn("rounded border border-border px-2 py-0.5 text-xs")}>{repo.syncStatus === "syncing" ? "Syncing..." : repo.syncStatus}</span></td>
              <td class={cn("p-2 text-muted-foreground")}>{shortDate(repo.lastSyncAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
