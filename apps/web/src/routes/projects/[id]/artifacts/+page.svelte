<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
</script>

<header
  data-project-artifacts-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Project artifacts</h1>
  <span class={cn("text-sm text-muted-foreground")}>Project {data.projectId}</span>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const artifacts = payload.artifacts}
  {@const stats = payload.stats}

  <div
    data-disk-usage-card
    class={cn("mb-6 grid grid-cols-2 gap-4 rounded-lg border border-border p-4")}
  >
    <div>
      <div class={cn("text-sm text-muted-foreground")}>Total size</div>
      <div data-total-bytes class={cn("text-lg font-semibold")}>{formatBytes(stats.totalBytes)}</div>
    </div>
    <div>
      <div class={cn("text-sm text-muted-foreground")}>Artifact count</div>
      <div data-artifact-count class={cn("text-lg font-semibold")}>{stats.count}</div>
    </div>
  </div>

  {#if artifacts.length === 0}
    <div
      data-empty-project-artifacts
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No artifacts for this project.</div>
  {:else}
    <div data-project-artifacts-list>
      <table class={cn("w-full text-sm")}>
        <thead>
          <tr class={cn("border-b border-border text-left")}>
            <th class={cn("pb-2 font-medium")}>Title</th>
            <th class={cn("pb-2 font-medium")}>Kind</th>
            <th class={cn("pb-2 font-medium")}>MIME</th>
            <th class={cn("pb-2 font-medium text-right")}>Size</th>
            <th class={cn("pb-2 font-medium")}>Created</th>
          </tr>
        </thead>
        <tbody>
          {#each artifacts as artifact (artifact.id)}
            <tr data-artifact-row={artifact.id} class={cn("border-b border-border/50")}>
              <td class={cn("py-2")}>
                <a href="/artifacts/{artifact.id}" class={cn("text-primary underline-offset-4 hover:underline")}>{artifact.title}</a>
              </td>
              <td class={cn("py-2")}>{artifact.kind}</td>
              <td class={cn("py-2")}>{artifact.mime ?? "-"}</td>
              <td class={cn("py-2 text-right")}>{artifact.size != null ? artifact.size.toLocaleString() : "-"}</td>
              <td class={cn("py-2")}>{artifact.created_at.slice(0, 10)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
