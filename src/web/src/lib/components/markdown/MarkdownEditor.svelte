<script lang="ts">
  import { browser } from "$app/environment";
  import CodeMirror from "svelte-codemirror-editor";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";

  import { extractMarkdownChange } from "./markdown-editor-helpers";

  interface Props {
    value?: string;
    onChange?: (next: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  }

  let {
    value = $bindable(""),
    onChange,
    placeholder,
    ariaLabel,
  }: Props = $props();

  function handleCodeMirrorChange(next: string): void {
    // Funnel through the helper so untyped event shapes can't slip in.
    const safe = extractMarkdownChange({ detail: { value: next } }) ?? "";
    value = safe;
    onChange?.(safe);
  }
</script>

<div
  data-markdown-editor
  data-cm-ready={browser ? "true" : "false"}
  aria-label={ariaLabel ?? "Markdown editor"}
>
  {#if browser}
    <CodeMirror
      bind:value
      lang={markdown()}
      theme={oneDark}
      placeholder={placeholder ?? null}
      onchange={handleCodeMirrorChange}
    />
  {/if}
  <textarea
    hidden
    data-markdown-editor-source
    aria-hidden="true"
    {value}
    readonly
  ></textarea>
</div>
