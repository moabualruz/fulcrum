<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { NodeViewWrapper } from "svelte-tiptap";

  interface Props {
    node: { attrs: Record<string, unknown>; textContent: string };
    selected?: boolean;
  }

  let { node, selected = false }: Props = $props();

  // Unique id for mermaid render target
  const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;

  let svgHtml = $state<string>("");
  let renderError = $state<string | null>(null);
  let showSource = $state(false);

  $effect(() => {
    const code = node.textContent ?? "";
    if (browser && code) {
      renderMermaid(code);
    }
  });

  async function renderMermaid(code: string): Promise<void> {
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: "default" });
      const { svg } = await mermaid.render(id, code);
      svgHtml = svg;
      renderError = null;
    } catch (err) {
      renderError = err instanceof Error ? err.message : String(err);
      svgHtml = "";
    }
  }
</script>

<!--
  NodeViewWrapper keeps TipTap node selection/drag working.
  Shows rendered SVG in preview, raw code when selected/editing.
-->
<NodeViewWrapper class="mermaid-node" data-selected={selected}>
  {#if showSource || !browser}
    <pre class="mermaid-source rounded-md bg-muted p-3 text-sm font-mono"><code>{node.textContent}</code></pre>
  {:else if renderError}
    <div class="mermaid-error rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
      <p class="font-medium">Mermaid render error</p>
      <pre class="mt-1 text-xs">{renderError}</pre>
      <pre class="mt-2 text-xs opacity-60"><code>{node.textContent}</code></pre>
    </div>
  {:else if svgHtml}
    <!-- eslint-disable-next-line svelte/no-at-html-tags: mermaid output, not user-supplied -->
    <div class="mermaid-svg overflow-x-auto">{@html svgHtml}</div>
  {:else}
    <div class="mermaid-loading rounded-md bg-muted p-3 text-sm text-muted-foreground">Rendering diagram…</div>
  {/if}

  <button
    type="button"
    class="mermaid-toggle mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
    onclick={() => (showSource = !showSource)}
  >
    {showSource ? "Show diagram" : "Show source"}
  </button>
</NodeViewWrapper>
