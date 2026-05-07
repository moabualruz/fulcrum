<script lang="ts">
  import { onMount } from "svelte";
  import { unified } from "unified";
  import remarkParse from "remark-parse";
  import remarkRehype from "remark-rehype";
  import rehypeShiki from "@shikijs/rehype";
  import rehypeStringify from "rehype-stringify";
  import DOMPurify from "dompurify";

  interface Props {
    markdown: string;
    /** Optional: override shiki theme. Default: github-dark */
    theme?: string;
  }

  let { markdown, theme = "github-dark" }: Props = $props();

  let html = $state("");
  let renderError = $state<string | null>(null);

  async function renderMarkdown(md: string): Promise<void> {
    try {
      const result = await unified()
        .use(remarkParse)
        .use(remarkRehype)
        .use(rehypeShiki, { theme })
        .use(rehypeStringify)
        .process(md);

      // T-06-13: DOMPurify sanitizes all HTML output — strips script/onerror/etc.
      html = DOMPurify.sanitize(String(result));
      renderError = null;
    } catch (err) {
      renderError = err instanceof Error ? err.message : String(err);
      html = "";
    }
  }

  onMount(() => {
    renderMarkdown(markdown);
  });

  $effect(() => {
    // Re-render when markdown prop changes
    renderMarkdown(markdown);
  });
</script>

<div class="readonly-renderer prose prose-sm max-w-none dark:prose-invert">
  {#if renderError}
    <div class="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
      Render error: {renderError}
    </div>
  {:else if html}
    <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized by DOMPurify (T-06-13) -->
    {@html html}
  {:else}
    <div class="text-muted-foreground italic">No content</div>
  {/if}
</div>
