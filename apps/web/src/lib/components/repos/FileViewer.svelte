<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    filePath: string;
    content: string | null;
    mimeCategory: "image" | "text" | "binary";
    isBinary: boolean;
    repoId: string;
    branch: string;
  }

  let { filePath, content, mimeCategory, isBinary, repoId, branch }: Props = $props();

  function fileName(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] ?? path;
  }

  // Line numbers for text content
  const lines = $derived(content?.split("\n") ?? []);
</script>

<div data-file-viewer class={cn("rounded-md border border-border overflow-auto")}>
  {#if mimeCategory === "image"}
    <div data-file-image class={cn("flex items-center justify-center p-6 bg-muted/10")}>
      <!-- For DB-stored repos, images reference the local file path or a served URL.
           Using a placeholder src; in production this would be a content-addressed URL. -->
      <img
        src="/api/repos/{repoId}/content/{filePath}?branch={encodeURIComponent(branch)}"
        alt={fileName(filePath)}
        class={cn("max-w-full max-h-[60vh] object-contain")}
        data-image-render
      />
    </div>
  {:else if isBinary || mimeCategory === "binary"}
    <div data-file-binary class={cn("flex flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground")}>
      <span>Binary file ({fileName(filePath)})</span>
      <a
        href="/api/repos/{repoId}/content/{filePath}?branch={encodeURIComponent(branch)}&download=1"
        data-file-download
        class={cn("inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent")}
      >
        Download
      </a>
    </div>
  {:else}
    <div data-file-text class={cn("overflow-auto")}>
      <table class={cn("w-full text-xs font-mono")}>
        <tbody>
          {#each lines as line, i (i)}
            <tr data-line={i + 1} class={cn("hover:bg-accent/30")}>
              <td class={cn("px-3 py-0.5 text-right text-muted-foreground select-none border-r border-border w-12 sticky left-0 bg-background")}>
                {i + 1}
              </td>
              <td class={cn("px-3 py-0.5 whitespace-pre")} data-code-line>
                {line}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
