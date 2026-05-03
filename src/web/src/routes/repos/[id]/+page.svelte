<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  function shortSha(sha: string): string {
    return sha.slice(0, 7);
  }
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  <header data-repo-detail-header class={cn("mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <a href="/repos" class={cn("text-sm text-muted-foreground hover:underline")}>← Repos</a>
      <div class={cn("mt-1 flex flex-wrap items-center gap-2")}>
        <h1 class={cn("text-2xl font-semibold tracking-tight")}>{payload.repo.name}</h1>
        <span class={cn("text-sm text-muted-foreground")}>{payload.repo.slug}</span>
        <span class={cn("rounded border border-border px-2 py-0.5 text-xs")}>{payload.repo.kind}</span>
      </div>
    </div>
    <form method="POST" action="?/sync" use:enhance>
      <button type="submit" data-sync-now class={cn(buttonVariants({ variant: "outline" }))}>Sync now</button>
    </form>
  </header>

  <section class={cn("mb-4 flex flex-wrap items-center gap-2 text-sm")}>
    <span data-current-branch class={cn("rounded border border-border px-2 py-1 font-mono text-xs")}>{payload.repo.currentBranch ?? "unknown"}</span>
    <span data-sync-status data-status={payload.repo.syncStatus} class={cn("rounded border border-border px-2 py-1 text-xs")}>{payload.repo.syncStatus === "syncing" ? "Syncing..." : payload.repo.syncStatus}</span>
    {#if payload.repo.syncError}
      <span data-sync-error title={payload.repo.syncError} class={cn("text-xs text-destructive")}>{payload.repo.syncError}</span>
    {/if}
  </section>

  <section class={cn("mb-4 grid gap-3 sm:grid-cols-2")}>
    <a href="/tasks?repo={payload.repo.id}" data-open-task-count class={cn("rounded-md border border-border p-4 hover:bg-muted/50")}>
      <div class={cn("text-xs text-muted-foreground")}>Open tasks</div>
      <div class={cn("text-2xl font-semibold")}>{payload.openTaskCount}</div>
    </a>
    <div data-recent-run-count class={cn("rounded-md border border-border p-4")}>
      <div class={cn("text-xs text-muted-foreground")}>Recent runs</div>
      <div class={cn("text-2xl font-semibold")}>{payload.recentRunCount}</div>
    </div>
  </section>

  <section data-recent-commits class={cn("rounded-md border border-border")}>
    <h2 class={cn("border-b border-border px-3 py-2 text-sm font-semibold")}>Recent commits</h2>
    <ul>
      {#each payload.commits as commit (commit.sha)}
        <li class={cn("grid gap-1 border-b border-border p-3 last:border-b-0 sm:grid-cols-[7rem_1fr_10rem]")}>
          <span class={cn("font-mono text-xs")}>{shortSha(commit.sha)}</span>
          <span>{commit.subject}</span>
          <span class={cn("text-xs text-muted-foreground")}>{commit.author ?? "unknown"}</span>
        </li>
      {:else}
        <li class={cn("p-3 text-sm text-muted-foreground")}>No commits synced.</li>
      {/each}
    </ul>
  </section>
{/await}
