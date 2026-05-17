<script lang="ts">
  import type { JSONContent } from "@tiptap/core";
  import { StarterKit } from "@tiptap/starter-kit";
  import { Mathematics } from "@tiptap/extension-mathematics";
  import { Link } from "@tiptap/extension-link";
  import { TaskList } from "@tiptap/extension-task-list";
  import { Placeholder } from "@tiptap/extension-placeholder";
  import { Mention } from "@tiptap/extension-mention";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import type { Editor } from "svelte-tiptap";
  import { onDestroy } from "svelte";
  import type { Unsubscriber } from "svelte/store";
  import { TOOLBAR_PRESETS } from "./toolbar-presets.js";
  import { detectDocEmbedProvider } from "./embed-providers";
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

  let slashMenuOpen = $state(false);
  let slashMenuPos = $state({ top: 0, left: 0 });

  const SLASH_MENU_ITEMS = [
    { label: "Heading 1", command: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", command: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", command: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "Bullet List", command: (e: Editor) => e.chain().focus().toggleBulletList().run() },
    { label: "Numbered List", command: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
    { label: "Task List", command: (e: Editor) => e.chain().focus().toggleTaskList().run() },
    { label: "Code Block", command: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
    { label: "Blockquote", command: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
    { label: "Horizontal Rule", command: (e: Editor) => e.chain().focus().setHorizontalRule().run() },
    { label: "Math Block", command: (e: Editor) => e.chain().focus().insertContent({ type: "math", attrs: { latex: "" } }).run() },
    { label: "Embed", command: insertEmbedBlock },
  ];

  function insertEmbedBlock(editor: Editor): void {
    const rawUrl = window.prompt("Embed URL");
    if (!rawUrl) return;
    const embed = detectDocEmbedProvider(rawUrl);
    editor.chain().focus().insertContent({
      type: "paragraph",
      attrs: {
        "data-doc-embed-provider": embed.provider,
        "data-doc-embed-url": embed.embeddableUrl,
      },
      content: [
        {
          type: "text",
          text: `${embed.label}: ${embed.url}`,
        },
      ],
    }).run();
  }

  function deleteSlashTrigger(): void {
    if (!editorInstance) return;
    const { from } = editorInstance.state.selection;
    editorInstance.chain().focus().deleteRange({ from: from - 1, to: from }).run();
  }

  function handleSlashItem(item: (typeof SLASH_MENU_ITEMS)[number]): void {
    if (!editorInstance) return;
    deleteSlashTrigger();
    item.command(editorInstance);
    slashMenuOpen = false;
  }

  function checkSlashTrigger(editor: Editor): void {
    const { $from: fromPos } = editor.state.selection;
    const textBefore = fromPos.parent.textContent.slice(0, fromPos.parentOffset);

    // Show slash menu when `/` is at start of line or after whitespace
    if (textBefore === "/" || textBefore.endsWith(" /")) {
      const coords = editor.view.coordsAtPos(fromPos.pos);
      const editorRect = editor.view.dom.closest("[data-doc-editor]")?.getBoundingClientRect();
      if (editorRect) {
        slashMenuPos = {
          top: coords.bottom - editorRect.top,
          left: coords.left - editorRect.left,
        };
      }
      slashMenuOpen = true;
    } else {
      slashMenuOpen = false;
    }
  }

  const editorStore = createEditor({
    extensions: [
      StarterKit,
      Mathematics,
      Link.configure({ openOnClick: false }),
      TaskList,
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          char: "@",
        },
      }),
    ],
    content,
    editable: !readonly,
    onUpdate: ({ editor }) => {
      editorInstance = editor;
      checkSlashTrigger(editor);
    },
  });

  unsubscribe = editorStore.subscribe((e) => {
    editorInstance = e;
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (slashMenuOpen && event.key === "Escape") {
      event.preventDefault();
      slashMenuOpen = false;
      return;
    }

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

  export function getJSON(): JSONContent | null {
    return editorInstance?.getJSON() ?? null;
  }

  export function getHTML(): string {
    return editorInstance?.getHTML() ?? "";
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tiptap-editor relative flex h-full flex-col" data-doc-editor onkeydown={handleKeydown} role="none">
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

  <div class="editor-content min-h-0 flex-1 overflow-y-auto px-6 py-4" data-editor-content>
    <EditorContent editor={$editorStore} />
  </div>

  {#if slashMenuOpen}
    <div
      data-slash-menu
      class="absolute z-50 w-56 rounded-md border border-border bg-popover p-1 shadow-md"
      style="top: {slashMenuPos.top}px; left: {slashMenuPos.left}px;"
    >
      {#each SLASH_MENU_ITEMS as item (item.label)}
        <button
          type="button"
          class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          onclick={() => handleSlashItem(item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
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

  .tiptap-editor :global(.mention) {
    background-color: var(--accent);
    border-radius: 0.25rem;
    padding: 0.125rem 0.25rem;
    font-weight: 500;
  }
</style>
