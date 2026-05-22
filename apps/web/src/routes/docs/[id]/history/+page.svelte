<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";
  import DocVersionTimeline from "$lib/components/docs/DocVersionTimeline.svelte";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
    form: ActionData;
  }

  let { data, form }: Props = $props();
  let timelineOpen = $state(true);

  async function handleFetchDiff(versionId: string): Promise<{ html: string; hasDiff: boolean }> {
    const fd = new FormData();
    fd.set("versionId", versionId);
    const response = await fetch(`?/diff`, {
      method: "POST",
      body: fd,
    });
    const result = await response.json();
    if (result.type === "failure") {
      return { html: "", hasDiff: false };
    }
    return result.data ?? { html: "", hasDiff: false };
  }

  async function handleRestore(versionId: string): Promise<void> {
    const fd = new FormData();
    fd.set("versionId", versionId);
    const response = await fetch(`?/restore`, {
      method: "POST",
      body: fd,
    });
    if (response.redirected) {
      window.location.href = response.url;
    }
  }
</script>

<header
  data-doc-history-header
  class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <div class={cn("flex items-baseline gap-3")}>
    <a
      href="/docs/{data.documentId}"
      data-back-doc
      class={cn("text-sm text-muted-foreground hover:underline")}
    >&larr; Back to doc</a>
    <h1 data-doc-title class={cn("text-2xl font-semibold tracking-tight")}>{data.title}</h1>
  </div>
</header>

<DocVersionTimeline
  documentId={data.documentId}
  versions={data.versions}
  currentVersionId={data.versions[0]?.id ?? null}
  onFetchDiff={handleFetchDiff}
  onRestore={handleRestore}
  bind:open={timelineOpen}
/>
