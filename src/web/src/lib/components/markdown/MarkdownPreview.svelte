<script lang="ts">
  import { cn } from "$lib/utils";
  import { renderMarkdownToHtml } from "./markdown-preview-helpers";

  interface Props {
    value?: string;
    class?: string;
  }

  let { value = "", class: className }: Props = $props();

  const html = $derived(renderMarkdownToHtml(value));
</script>

<article
  data-markdown-preview
  class={cn("prose prose-zinc dark:prose-invert max-w-none", className)}
>
  {@html html}
</article>
