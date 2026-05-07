<script lang="ts">
  import type { JSONContent } from "@tiptap/core";
  import { StarterKit } from "@tiptap/starter-kit";
  import { Mathematics } from "@tiptap/extension-mathematics";
  import { Link } from "@tiptap/extension-link";
  import { TaskList } from "@tiptap/extension-task-list";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import type { Editor } from "svelte-tiptap";
  import { onDestroy } from "svelte";
  import type { Unsubscriber } from "svelte/store";
  import { TOOLBAR_PRESETS } from "./toolbar-presets.js";
  import "katex/dist/katex.min.css";

  interface Props {
    content?: JSONContent;
    docType?: string;
    onSave?: (json: JSONContent) => void | Promise<void>;
    placeholder?: string;
    readonly?: boolean;
  }

  const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

  let {
    content = EMPTY_DOC,
    docType = "note",
    onSave,
    placeholder = "Start writing…",
    readonly = false,
  }: Props = $props();

  const toolbarItems = $derived(TOOLBAR_PRESETS[docType] ?? TOOLBAR_PRESETS["note"]);

  let editorInstance = $state<Editor | null>(null);
  let unsubscribe: Unsubscriber | undefined;

  const editorStore = createEditor({
    extensions: [
      StarterKit,
      Mathematics,
      Link.configure({ openOnClick: false }),
      TaskList,
    ],
    content,
    editable: !readonly,
    onUpdate: ({ editor }) => {
      // no autosave — explicit Cmd+S only
      editorInstance = editor;
    },
  });

  unsubscribe = editorStore.subscribe((e) => {
    editorInstance = e;
  });

  function handleKeydown(event: KeyboardEvent): void {
    // Cmd+S (Mac) or Ctrl+S (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === "s") {
      event.preventDefault();
      if (editorInstance && onSave) {
        onSave(editorInstance.getJSON());
      }
    }
  }

  function execCommand(command: string): void {
    if (!editorInstance) return;
    const chain = editorInstance.chain().focus();
    switch (command) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
      case "codeBlock":
        chain.toggleCodeBlock().run();
        break;
      case "heading":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "taskList":
        chain.toggleTaskList().run();
        break;
      default:
        break;
    }
  }

  function isActive(command: string): boolean {
    if (!editorInstance) return false;
    switch (command) {
      case "bold":
        return editorInstance.isActive("bold");
      case "italic":
        return editorInstance.isActive("italic");
      case "code":
        return editorInstance.isActive("code");
      case "codeBlock":
        return editorInstance.isActive("codeBlock");
      case "heading":
        return editorInstance.isActive("heading");
      case "taskList":
        return editorInstance.isActive("taskList");
      default:
        return false;
    }
  }

  // Toolbar label map
  const LABELS: Record<string, string> = {
    heading: "H",
    bold: "B",
    italic: "I",
    code: "<>",
    codeBlock: "```",
    math: "∑",
    mermaid: "⟨⟩",
    image: "Img",
    table: "⊞",
    link: "🔗",
    wikilink: "[[]]",
    taskList: "☑",
    timeline: "⏱",
  };

  const CLICKABLE = new Set(["heading", "bold", "italic", "code", "codeBlock", "taskList"]);

  onDestroy(() => {
    unsubscribe?.();
    editorInstance?.destroy();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tiptap-editor flex h-full flex-col" onkeydown={handleKeydown} role="none">
  <!-- Toolbar: 48px height, border-bottom, secondary bg per UI-SPEC -->
  {#if !readonly}
    <div
      class="toolbar flex h-12 shrink-0 items-center gap-1 border-b border-border bg-secondary px-3"
      role="toolbar"
      aria-label="Editor toolbar"
    >
      {#each toolbarItems as item (item)}
        {#if CLICKABLE.has(item)}
          <button
            type="button"
            class="toolbar-btn inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm font-medium transition-colors hover:bg-background/80 data-[active=true]:bg-background data-[active=true]:shadow-sm"
            data-active={isActive(item)}
            aria-label={item}
            title={item}
            onclick={() => execCommand(item)}
          >
            {LABELS[item] ?? item}
          </button>
        {:else}
          <span
            class="toolbar-tag inline-flex h-7 items-center rounded px-1.5 text-xs text-muted-foreground"
            title={item}
          >
            {LABELS[item] ?? item}
          </span>
        {/if}
      {/each}

      <div class="ml-auto text-xs text-muted-foreground">⌘S to save</div>
    </div>
  {/if}

  <!-- Editor content area -->
  <div class="editor-content min-h-0 flex-1 overflow-y-auto px-6 py-4">
    <EditorContent editor={$editorStore} />
  </div>
</div>

<style>
  .tiptap-editor :global(.ProseMirror) {
    outline: none;
    min-height: 200px;
  }

  .tiptap-editor :global(.ProseMirror p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--muted-foreground);
    pointer-events: none;
    height: 0;
  }
</style>
