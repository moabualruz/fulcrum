<script lang="ts">
  import type { PageData } from "./$types";
  import FileViewer from "$lib/components/repos/FileViewer.svelte";
  import BlameView from "$lib/components/repos/BlameView.svelte";
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
  {@const filePath = payload.filePath}
  {@const mimeCategory = payload.mimeCategory}
  {@const content = payload.content}
  {@const isBinary = payload.isBinary}
  {@const showBlame = payload.showBlame}
  {@const blame = payload.blame}

  <header data-file-detail-header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
    <div class={cn("flex items-baseline gap-3")}>
      <a href="/repos/{repo.id}/files?branch={encodeURIComponent(branch)}" data-back-files class={cn("text-sm text-muted-foreground hover:underline")}>← Files</a>
      <h1 class={cn("text-lg font-semibold tracking-tight font-mono")}>{filePath}</h1>
    </div>
    <div class={cn("flex items-center gap-3")}>
      <BranchSelector {branches} activeBranch={branch} />
      {#if !isBinary && mimeCategory === "text"}
        {#if showBlame}
          <a
            href="/repos/{repo.id}/files/{filePath}?branch={encodeURIComponent(branch)}"
            data-toggle-blame
            class={cn("text-sm text-muted-foreground hover:underline")}
          >Hide blame</a>
        {:else}
          <a
            href="/repos/{repo.id}/files/{filePath}?branch={encodeURIComponent(branch)}&blame=1"
            data-toggle-blame
            class={cn("text-sm text-muted-foreground hover:underline")}
          >Blame</a>
        {/if}
      {/if}
    </div>
  </header>

  {#if showBlame && blame.length > 0}
    <BlameView {blame} repoId={repo.id} />
  {:else}
    <FileViewer
      {filePath}
      {content}
      {mimeCategory}
      {isBinary}
      repoId={repo.id}
      {branch}
    />
  {/if}
{/await}
