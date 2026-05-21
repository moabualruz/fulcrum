<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header
  data-run-artifacts-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Run artifacts</h1>
  <span class={cn("text-sm text-muted-foreground")}>Run {data.runId}</span>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const artifacts = payload.artifacts}
  {#if artifacts.length === 0}
    <div
      data-empty-run-artifacts
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No artifacts for this run.</div>
  {:else}
    <div data-run-artifacts-list>
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
