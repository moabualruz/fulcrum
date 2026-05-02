<script lang="ts">
  import type { JSONContent } from "@tiptap/core";
  import { StarterKit } from "@tiptap/starter-kit";
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import type { Unsubscriber } from "svelte/store";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import type { Editor } from "svelte-tiptap";

  interface Props {
    content?: JSONContent;
    onchange?: (event: CustomEvent<JSONContent>) => void;
    ariaLabel?: string;
  }

  const EMPTY_DOC: JSONContent = { type: "doc" };

  let {
    content = EMPTY_DOC,
    onchange,
    ariaLabel = "Document editor",
  }: Props = $props();

  const dispatch = createEventDispatcher<{ change: JSONContent }>();

  let editor = $state<Editor | null>(null);
  let unsubscribe: Unsubscriber | undefined;
  let lastPropContent = $state("");
  let latestJson = $state<JSONContent>(EMPTY_DOC);

  function emitChange(next: JSONContent): void {
    latestJson = next;
    dispatch("change", next);
    onchange?.(new CustomEvent<JSONContent>("change", { detail: next }));
  }

  onMount(() => {
    const initialContent = content;
    lastPropContent = JSON.stringify(initialContent);

    const store = createEditor({
      extensions: [StarterKit],
      content: initialContent,
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          "data-editor-baseline-input": "true",
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        emitChange(updatedEditor.getJSON());
      },
    });

    unsubscribe = store.subscribe((nextEditor) => {
      editor = nextEditor;
      latestJson = nextEditor.getJSON();
    });
  });

  $effect(() => {
    if (!editor) {
      return;
    }

    const nextPropContent = JSON.stringify(content);
    if (nextPropContent === lastPropContent) {
      return;
    }

    lastPropContent = nextPropContent;
    if (JSON.stringify(editor.getJSON()) !== nextPropContent) {
      editor.commands.setContent(content, { emitUpdate: false });
      latestJson = editor.getJSON();
    }
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

<div
  data-editor-baseline
  data-editor-ready={editor ? "true" : "false"}
  data-editor-json={JSON.stringify(latestJson)}
>
  {#if editor}
    <div data-editor-baseline-toolbar class="editor-baseline__toolbar">
      <button
        type="button"
        data-editor-bold
        title="Bold"
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
        class:active={editor.isActive("bold")}
        onclick={() => editor?.chain().focus().toggleBold().run()}
      >
        B
      </button>
    </div>
    <EditorContent editor={editor} class="editor-baseline__content" />
  {/if}
</div>

<style>
  .editor-baseline__toolbar {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .editor-baseline__toolbar button {
    align-items: center;
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    display: inline-flex;
    font-weight: 700;
    height: 2rem;
    justify-content: center;
    width: 2rem;
  }

  .editor-baseline__toolbar button.active {
    background: hsl(var(--primary, 222 47% 11%));
    color: hsl(var(--primary-foreground, 210 40% 98%));
  }

  :global(.editor-baseline__content .ProseMirror) {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    min-height: 8rem;
    padding: 0.75rem;
  }

  :global(.editor-baseline__content .ProseMirror:focus) {
    outline: 2px solid hsl(var(--ring, 222 84% 5%));
    outline-offset: 2px;
  }
</style>
