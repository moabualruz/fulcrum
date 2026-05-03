<script lang="ts">
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

  function relTime(value: string | null): string {
    if (!value) return "unknown";
    const diff = Date.now() - new Date(value).getTime();
    const hours = Math.max(1, Math.round(diff / 3_600_000));
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <header class={cn("mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <a href="/repos/{payload.repo.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← {payload.repo.name}</a>
      <h1 class={cn("mt-1 text-2xl font-semibold tracking-tight")}>Commits</h1>
    </div>
  </header>

  <section class={cn("rounded-md border border-border")}>
    <ul>
      {#each payload.commits as commit (commit.sha)}
        <li class={cn("grid gap-3 border-b border-border p-3 last:border-b-0 sm:grid-cols-[7rem_1fr_12rem_8rem]")}>
          <a href="/repos/{payload.repo.id}/commits/{commit.sha}" class={cn("font-mono text-xs hover:underline")}>{shortSha(commit.sha)}</a>
          <div>
            <div>{commit.subject}</div>
            <div class={cn("mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground")}>
              {#each commit.parents as parent}
                <a href="/repos/{payload.repo.id}/commits/{parent}" class={cn("font-mono hover:underline")}>{shortSha(parent)}</a>
              {/each}
            </div>
          </div>
          <div class={cn("flex items-center gap-2 text-sm")}>
            <span class={cn("grid size-7 place-items-center rounded-full border border-border text-xs")}>{commit.avatarInitials}</span>
            <span>{commit.authorName}</span>
          </div>
          <span class={cn("text-xs text-muted-foreground")}>{relTime(commit.committedAt)}</span>
        </li>
      {:else}
        <li class={cn("p-3 text-sm text-muted-foreground")}>No commits synced.</li>
      {/each}
    </ul>
  </section>

  <nav class={cn("mt-4 flex items-center justify-between")}>
    {#if payload.page > 1}
      <a href="?page={payload.page - 1}" class={cn(buttonVariants({ variant: "outline" }))}>Previous</a>
    {:else}
      <span></span>
    {/if}
    {#if payload.hasMore}
      <a data-load-more href="?page={payload.page + 1}" class={cn(buttonVariants({ variant: "outline" }))}>Load more</a>
    {/if}
  </nav>
{/await}
