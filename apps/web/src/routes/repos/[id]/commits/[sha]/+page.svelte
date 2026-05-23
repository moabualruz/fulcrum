<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  <header class={cn("mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <a href="/repos/{payload.repo.id}/commits" class={cn("text-sm text-muted-foreground hover:underline")}>← Commits</a>
      <h1 class={cn("mt-1 text-xl font-semibold tracking-tight")}>{payload.commit.subject}</h1>
      <div class={cn("mt-1 font-mono text-xs text-muted-foreground")}>{payload.commit.sha}</div>
    </div>
    <div class={cn("flex gap-2")}>
      <a href="?view=unified" class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>Unified</a>
      <a href="?view=split" class={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>Split</a>
    </div>
  </header>

  <section class={cn("mb-4 flex flex-wrap gap-2 text-sm")}>
    <span class={cn("rounded border border-border px-2 py-1")}>{payload.diff.filesChanged} files changed</span>
    <span class={cn("rounded border border-border px-2 py-1 text-emerald-700")}>+{payload.diff.insertions}</span>
    <span class={cn("rounded border border-border px-2 py-1 text-red-700")}>-{payload.diff.deletions}</span>
  </section>

  <section data-commit-diff class={cn("overflow-x-auto rounded-md border border-border p-3 font-mono text-xs")}>
    {@html payload.diff.html}
  </section>
{/await}
