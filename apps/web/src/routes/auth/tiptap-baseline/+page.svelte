<script lang="ts">
  import type { JSONContent } from "@tiptap/core";
  import EditorBaseline from "$lib/components/editor/EditorBaseline.svelte";

  const content: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
  let changeJson = $state("");

  function handleChange(event: CustomEvent<JSONContent>): void {
    changeJson = JSON.stringify(event.detail);
  }
</script>

<main data-tiptap-baseline-harness>
  <EditorBaseline {content} on:change={handleChange} />
  <pre data-tiptap-change-json>{changeJson}</pre>
</main>
