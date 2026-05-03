<script lang="ts">
  import type { PageData } from "./$types";
  import TreeNode from "$lib/components/repos/TreeNode.svelte";
  import BranchSelector from "$lib/components/repos/BranchSelector.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  {@const repo = payload.repo}
  {@const branch = payload.branch}
  {@const branches = payload.branches}
  {@const rootChildren = payload.rootChildren}

  <header data-files-header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/repos/{repo.id}" data-back-repo class={cn("text-sm text-muted-foreground hover:underline")}>← {repo.slug}</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Files</h1>
    </div>
    <BranchSelector {branches} activeBranch={branch} />
  </header>

  <div data-file-tree class={cn("rounded-md border border-border bg-background p-2")}>
    {#if rootChildren.length === 0}
      <div data-tree-empty class={cn("p-6 text-sm text-muted-foreground text-center")}>
        No files indexed for branch <code>{branch}</code>.
      </div>
    {:else}
      {#each rootChildren as node (node.id)}
        <TreeNode {node} repoId={repo.id} {branch} />
      {/each}
    {/if}
  </div>
{/await}
