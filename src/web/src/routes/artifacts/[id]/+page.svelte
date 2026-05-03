<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
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
  {@const artifact = payload.artifact}
  <header class={cn("mb-4 flex items-center justify-between gap-4 border-b border-border pb-4")}>
    <div>
      <a href="/artifacts" class={cn("text-sm text-muted-foreground hover:underline")}>← Artifacts</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>{artifact.title}</h1>
    </div>
    <a href={artifact.downloadHref} class={cn("rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent")}>Download</a>
  </header>

  <p data-artifact-retention class={cn("mb-3 text-sm text-muted-foreground")}>{artifact.retentionDaysRemaining} days remaining</p>

  {#if artifact.mime?.startsWith("image/")}
    <img data-artifact-inline-preview src={artifact.downloadHref} alt="" class={cn("max-h-[70vh] rounded-md border border-border object-contain")} />
  {:else}
    <pre data-artifact-inline-preview class={cn("max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{artifact.content ?? ""}</pre>
  {/if}

  <form method="POST" action="?/delete" use:enhance class={cn("mt-4")}>
    <button data-artifact-delete type="submit" class={cn("rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground")}>Delete</button>
  </form>
{/await}
