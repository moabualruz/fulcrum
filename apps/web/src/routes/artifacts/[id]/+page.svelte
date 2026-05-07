<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  function previewKind(artifact: { mime?: string | null; title?: string; filename?: string }) {
    const mime = artifact.mime ?? "";
    const name = artifact.title ?? artifact.filename ?? "";
    if (mime === "image/png") return "image";
    if (mime === "text/markdown" || name.endsWith(".md")) return "markdown";
    if (mime.startsWith("text/")) return "text";
    if (mime === "application/json" || mime === "application/javascript" || name.match(/\.(ts|tsx|js|jsx|css|html)$/)) return "code";
    return "download";
  }

  function retentionStatus(artifact: { archived?: boolean; retentionDaysRemaining?: number }) {
    if (artifact.archived) return "archived";
    if (artifact.retentionDaysRemaining === 0) return "expired";
    if (typeof artifact.retentionDaysRemaining === "number") return `${artifact.retentionDaysRemaining} days remaining`;
    return "active";
  }
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

  <dl class={cn("mb-4 grid gap-2 text-sm md:grid-cols-2")}>
    <div><dt class={cn("text-muted-foreground")}>Digest</dt><dd>{artifact.sha256 ?? "—"}</dd></div>
    <div><dt class={cn("text-muted-foreground")}>MIME</dt><dd>{artifact.mime ?? "application/octet-stream"}</dd></div>
    <div data-artifact-retention><dt class={cn("text-muted-foreground")}>Retention</dt><dd>{retentionStatus(artifact)}</dd></div>
    <div><dt class={cn("text-muted-foreground")}>Preview</dt><dd>{previewKind(artifact)}</dd></div>
    <div>
      <dt class={cn("text-muted-foreground")}>Source run</dt>
      <dd>
        {#if artifact.run_id}
          <a data-artifact-run-link href="/runs/{artifact.run_id}" class={cn("text-primary underline-offset-4 hover:underline")}>{artifact.run_id}</a>
        {:else}
          —
        {/if}
      </dd>
    </div>
  </dl>

  {#if previewKind(artifact) === "image"}
    <img data-artifact-inline-preview src={artifact.downloadHref} alt="" class={cn("max-h-[70vh] rounded-md border border-border object-contain")} />
  {:else if previewKind(artifact) === "text" || previewKind(artifact) === "markdown" || previewKind(artifact) === "code"}
    <pre data-artifact-inline-preview class={cn("max-h-[70vh] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap")}>{artifact.content ?? ""}</pre>
  {:else}
    <div data-artifact-download-only class={cn("rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground")}>Inline preview unavailable. Download required.</div>
  {/if}

  <form method="POST" action="?/delete" use:enhance class={cn("mt-4")}>
    <button data-artifact-delete type="submit" class={cn("rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground")}>Delete</button>
  </form>
{/await}
