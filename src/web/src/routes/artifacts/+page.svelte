<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("mb-4 border-b border-border pb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Artifacts</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <div class={cn("grid gap-4 md:grid-cols-[220px_1fr]")}>
    <form data-artifacts-filter-sidebar method="GET" class={cn("flex flex-col gap-2 border-r border-border pr-4")}>
      <input name="kind" value={data.filter.kind} placeholder="kind" class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")} />
      <input name="project" value={data.filter.project} placeholder="project" class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")} />
      <input name="run" value={data.filter.run} placeholder="run" class={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")} />
      <button class={cn("h-9 rounded-md border border-input px-3 text-sm font-medium")} type="submit">Apply</button>
      <span class={cn("text-xs text-muted-foreground")}>{payload.artifacts.length} artifacts</span>
    </form>
    <ul data-artifacts-list class={cn("flex flex-col gap-3")}>
      {#each payload.artifacts as artifact (artifact.id)}
        <li data-artifact-row data-artifact-id={artifact.id} class={cn("rounded-md border border-border p-3")}>
          <div class={cn("flex items-center justify-between gap-3")}>
            <a href={`/artifacts/${artifact.id}`} class={cn("font-medium hover:underline")}>{artifact.title}</a>
            <span class={cn("text-xs text-muted-foreground")}>{artifact.kind}</span>
          </div>
          {#if artifact.thumbnail}
            <img data-artifact-thumbnail src={artifact.downloadHref} alt="" class={cn("mt-2 h-20 w-28 rounded border border-border object-cover")} />
          {/if}
          {#if artifact.preview}
            <pre data-artifact-preview class={cn("mt-2 overflow-hidden text-xs whitespace-pre-wrap text-muted-foreground")}>{artifact.preview}</pre>
          {/if}
        </li>
      {:else}
        <li data-empty-artifacts class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No artifacts.</li>
      {/each}
    </ul>
  </div>
{/await}
