<script lang="ts">
  import type { Editor as CoreEditor, JSONContent } from "@tiptap/core";
  import type { Doc } from "yjs";
  import { createEventDispatcher, onDestroy, onMount, tick } from "svelte";
  import type { Unsubscriber } from "svelte/store";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import type { CollabProvider } from "$lib/collab/types.js";
  import { handleAttachmentFiles } from "./embeds";
  import {
    createAutosaveScheduler,
    createDocEditorExtensions,
    filterSlashMenuItems,
    getSlashMenuItems,
    insertSlashMenuItem,
    type SlashMenuItem,
  } from "./slash-menu";

  interface Props {
    content?: JSONContent;
    save?: (contentJson: JSONContent, bodyMd: string) => Promise<void> | void;
    onchange?: (event: CustomEvent<{ contentJson: JSONContent; bodyMd: string }>) => void;
    oncomment?: (event: CustomEvent<{ anchorRange: { from: number; to: number; text_preview: string } }>) => void;
    collabProvider?: CollabProvider | null;
    ariaLabel?: string;
  }

  const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
  const ALL_ITEMS = getSlashMenuItems();
  const dispatch = createEventDispatcher<{
    change: { contentJson: JSONContent; bodyMd: string };
    comment: { anchorRange: { from: number; to: number; text_preview: string } };
  }>();

  let {
    content = EMPTY_DOC,
    save,
    onchange,
    oncomment,
    collabProvider = null,
    ariaLabel = "Document editor",
  }: Props = $props();

  let editor = $state<CoreEditor | null>(null);
  let unsubscribe: Unsubscriber | undefined;
  /* svelte-ignore state_referenced_locally */
  let latestJson = $state<JSONContent>(content);
  let latestBodyMd = $state("");
  let slashOpen = $state(false);
  let slashQuery = $state("");
  let selectedIndex = $state(0);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let suppressSlashState = false;
  let searchOpen = $state(false);
  let searchTerm = $state("");
  let replaceTerm = $state("");
  let searchMatchCount = $state(0);

  const filteredItems = $derived(filterSlashMenuItems(ALL_ITEMS, slashQuery));

  const scheduleAutosave = createAutosaveScheduler({
    delayMs: 2000,
    save: async (contentJson, bodyMd) => {
      if (!save) return;
      saving = true;
      saveError = null;
      try {
        await save(contentJson, bodyMd ?? "");
      } catch (error) {
        saveError = error instanceof Error ? error.message : "Save failed";
      } finally {
        saving = false;
      }
    },
  });

  function handleUpdate(updatedEditor: CoreEditor): void {
    latestJson = updatedEditor.getJSON();
    latestBodyMd = editorJsonToMarkdown(latestJson);
    const detail = { contentJson: latestJson, bodyMd: latestBodyMd };
    dispatch("change", detail);
    onchange?.(new CustomEvent("change", { detail }));
    scheduleAutosave(latestJson, latestBodyMd);
    if (suppressSlashState) {
      suppressSlashState = false;
      slashOpen = false;
      slashQuery = "";
      return;
    }
    updateSlashState(updatedEditor);
  }

  function updateSlashState(updatedEditor: CoreEditor): void {
    const { state } = updatedEditor;
    const { from } = state.selection;
    const blockStart = state.selection.$from.start();
    const textBefore = state.doc.textBetween(blockStart, from, "\n", "\n");
    const slashIndex = textBefore.lastIndexOf("/");
    if (slashIndex === -1) {
      slashOpen = false;
      slashQuery = "";
      return;
    }

    slashQuery = textBefore.slice(slashIndex + 1);
    slashOpen = !slashQuery.includes(" ");
    selectedIndex = Math.min(selectedIndex, Math.max(filteredItems.length - 1, 0));
  }

  function chooseItem(item: SlashMenuItem | undefined): void {
    if (!editor || !item) return;
    suppressSlashState = true;
    insertSlashMenuItem(editor, item.id);
    slashOpen = false;
    slashQuery = "";
    void tick().then(() => {
      if (editor) handleUpdate(editor);
    });
  }

  function createCommentAnchor(): void {
    if (!editor) return;
    const selectionText = window.getSelection()?.toString() ?? "";
    const { from, to } = editor.state.selection;
    const preview = selectionText || editor.state.doc.textBetween(from, to, " ", " ");
    if (!preview.trim()) return;
    const anchorRange = {
      from,
      to: Math.max(to, from + preview.length),
      text_preview: preview,
    };
    dispatch("comment", { anchorRange });
    oncomment?.(new CustomEvent("comment", { detail: { anchorRange } }));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      const href = window.prompt("Link URL");
      if (href) editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "h") {
      event.preventDefault();
      searchOpen = !searchOpen;
      return;
    }

    if (!slashOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % Math.max(filteredItems.length, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex = (selectedIndex - 1 + Math.max(filteredItems.length, 1)) % Math.max(filteredItems.length, 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseItem(filteredItems[selectedIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      slashOpen = false;
      slashQuery = "";
    }
  }

  function findInEditor(): void {
    if (!editor || !searchTerm) { searchMatchCount = 0; return; }
    const text = editor.getText();
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = text.match(regex);
    searchMatchCount = matches?.length ?? 0;
  }

  function replaceNext(): void {
    if (!editor || !searchTerm) return;
    const { state } = editor;
    const text = state.doc.textContent;
    const idx = text.indexOf(searchTerm, state.selection.from);
    if (idx === -1) return;
    editor.chain().focus().setTextSelection({ from: idx, to: idx + searchTerm.length }).insertContent(replaceTerm).run();
    findInEditor();
  }

  function replaceAll(): void {
    if (!editor || !searchTerm) return;
    const text = editor.getText();
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const newText = text.replace(regex, replaceTerm);
    editor.commands.setContent(newText);
    searchMatchCount = 0;
  }

  function handleEditorFiles(files: File[]): boolean {
    if (!editor || files.length === 0) return false;
    void handleAttachmentFiles(editor, files).then(() => {
      if (editor) handleUpdate(editor);
    });
    return true;
  }

  onMount(() => {
    const collaborationDocument = collabProvider?.document as Doc | undefined;
    const store = createEditor({
      extensions: createDocEditorExtensions({ collaborationDocument }),
      content: collaborationDocument ? undefined : content,
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          "data-doc-editor-input": "true",
        },
        handleKeyDown: (_view, event) => {
          handleKeydown(event);
          return event.defaultPrevented;
        },
        handlePaste: (_view, event) => {
          const handled = handleEditorFiles(Array.from(event.clipboardData?.files ?? []));
          if (handled) event.preventDefault();
          return handled;
        },
        handleDrop: (_view, event) => {
          const handled = handleEditorFiles(Array.from(event.dataTransfer?.files ?? []));
          if (handled) event.preventDefault();
          return handled;
        },
      },
      onUpdate: ({ editor: updatedEditor }) => handleUpdate(updatedEditor),
    });

    unsubscribe = store.subscribe((nextEditor) => {
      editor = nextEditor;
      latestJson = nextEditor.getJSON();
      latestBodyMd = editorJsonToMarkdown(latestJson);
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  function editorJsonToMarkdown(json: JSONContent): string {
    return (json.content ?? []).map(nodeToMarkdown).join("\n\n").trimEnd();
  }

  function nodeToMarkdown(node: JSONContent): string {
    const text = (node.content ?? []).map(nodeToMarkdown).join("");
    if (node.type === "text") return markText(node.text ?? "", node.marks ?? []);
    if (node.type === "heading") return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${text}`;
    if (node.type === "paragraph") return text;
    if (node.type === "blockquote") return text.split("\n").map((line) => `> ${line}`).join("\n");
    if (node.type === "bulletList") return (node.content ?? []).map((item) => `- ${nodeToMarkdown(item)}`).join("\n");
    if (node.type === "orderedList") return (node.content ?? []).map((item, index) => `${index + 1}. ${nodeToMarkdown(item)}`).join("\n");
    if (node.type === "taskList") return (node.content ?? []).map((item) => `- [${item.attrs?.checked ? "x" : " "}] ${nodeToMarkdown(item)}`).join("\n");
    if (node.type === "listItem" || node.type === "taskItem") return (node.content ?? []).map(nodeToMarkdown).join("");
    if (node.type === "codeBlock") return `\`\`\`${node.attrs?.language ?? ""}\n${text}\n\`\`\``;
    if (node.type === "horizontalRule") return "---";
    if (node.type === "table") return (node.content ?? []).map(nodeToMarkdown).join("\n");
    if (node.type === "tableRow") return `| ${(node.content ?? []).map(nodeToMarkdown).join(" | ")} |`;
    if (node.type === "tableCell") return text;
    if (node.type === "narration-block") return `> [AI Summary]\n>\n${String(node.attrs?.text ?? "").split("\n").map((line) => line.trim() ? `> ${line}` : ">").join("\n")}\n\n---`;
    if (node.type === "wikilink") return `[[${node.attrs?.slug ?? ""}]]`;
    if (node.type === "mention") return String(node.attrs?.label ?? `@${node.attrs?.id ?? ""}`);
    if (node.type === "image") return `![${node.attrs?.alt || node.attrs?.filename || ""}](${node.attrs?.src || node.attrs?.url || ""})`;
    if (node.type === "fileAttachment") return `[${node.attrs?.filename ?? "Attachment"}](${node.attrs?.url ?? ""})`;
    return text;
  }

  function markText(text: string, marks: NonNullable<JSONContent["marks"]>): string {
    return marks.reduce((next, mark) => {
      if (mark.type === "bold") return `**${next}**`;
      if (mark.type === "italic") return `_${next}_`;
      if (mark.type === "strike") return `~~${next}~~`;
      if (mark.type === "code") return `\`${next}\``;
      if (mark.type === "link") return `[${next}](${mark.attrs?.href ?? ""})`;
      return next;
    }, text);
  }
</script>

<div data-doc-editor data-saving={saving ? "true" : "false"} data-error={saveError ?? undefined}>
  {#if editor}
    <div data-doc-editor-toolbar class="doc-editor__toolbar">
      <button type="button" aria-label="Bold" title="Bold" data-doc-bold onclick={() => editor?.chain().focus().toggleBold().run()}>B</button>
      <button type="button" aria-label="Italic" title="Italic" data-doc-italic onclick={() => editor?.chain().focus().toggleItalic().run()}>I</button>
      <button type="button" aria-label="Strike" title="Strike" data-doc-strike onclick={() => editor?.chain().focus().toggleStrike().run()}>S</button>
      <button type="button" aria-label="Underline" title="Underline" data-doc-underline onclick={() => editor?.chain().focus().toggleUnderline().run()}>U</button>
      <button type="button" aria-label="Inline code" title="Inline code" data-doc-code onclick={() => editor?.chain().focus().toggleCode().run()}>{`<>`}</button>
      <button type="button" aria-label="Heading 1" title="Heading 1" data-doc-heading-1 onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
      <button type="button" aria-label="Heading 2" title="Heading 2" data-doc-heading-2 onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      <button type="button" aria-label="Bullet list" title="Bullet list" data-doc-bullet-list onclick={() => editor?.chain().focus().toggleBulletList().run()}>•</button>
      <button type="button" aria-label="Numbered list" title="Numbered list" data-doc-ordered-list onclick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
      <button type="button" aria-label="Task list" title="Task list" data-doc-task-list onclick={() => editor?.chain().focus().toggleTaskList().run()}>☑</button>
      <button type="button" aria-label="Quote" title="Quote" data-doc-quote onclick={() => editor?.chain().focus().toggleBlockquote().run()}>“</button>
      <button type="button" aria-label="Code block" title="Code block" data-doc-code-block onclick={() => editor?.chain().focus().toggleCodeBlock().run()}>{`</>`}</button>
      <button type="button" aria-label="Table" title="Table" data-doc-table onclick={() => editor && insertSlashMenuItem(editor, "table")}>▦</button>
      <button type="button" aria-label="Unlink" title="Unlink" data-doc-unlink onclick={() => editor?.chain().focus().unsetLink().run()}>⨯</button>
      <button type="button" aria-label="Comment" title="Comment" data-doc-comment onclick={createCommentAnchor}>💬</button>
      <button type="button" aria-label="Find & Replace" title="Find & Replace (Ctrl+H)" data-doc-search onclick={() => { searchOpen = !searchOpen; }}>🔍</button>
    </div>
    {#if searchOpen}
      <div data-doc-search-bar class="doc-editor__search-bar">
        <input type="text" placeholder="Find..." bind:value={searchTerm} oninput={findInEditor} aria-label="Search" class="doc-editor__search-input" />
        <span class="doc-editor__search-count">{searchMatchCount} match{searchMatchCount === 1 ? '' : 'es'}</span>
        <input type="text" placeholder="Replace..." bind:value={replaceTerm} aria-label="Replace" class="doc-editor__search-input" />
        <button type="button" onclick={replaceNext} class="doc-editor__search-btn">Replace</button>
        <button type="button" onclick={replaceAll} class="doc-editor__search-btn">All</button>
        <button type="button" onclick={() => { searchOpen = false; searchTerm = ''; replaceTerm = ''; searchMatchCount = 0; }} class="doc-editor__search-btn">✕</button>
      </div>
    {/if}
    <div class="doc-editor__surface">
      <EditorContent editor={editor as never} class="doc-editor__content" />
      {#if slashOpen}
        <div data-slash-menu role="listbox" class="doc-editor__slash">
          {#each filteredItems as item, index (item.id)}
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              data-slash-item={item.id}
              class:active={index === selectedIndex}
              onclick={() => chooseItem(item)}
            >
              {item.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  <input type="hidden" name="content_json" value={JSON.stringify(latestJson)} />
  <input type="hidden" name="body" value={latestBodyMd} />
  {#if saving}<p data-doc-saving class="doc-editor__status">Saving</p>{/if}
  {#if saveError}<p data-doc-save-error class="doc-editor__error">{saveError}</p>{/if}
</div>

<style>
  .doc-editor__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .doc-editor__toolbar button,
  .doc-editor__slash button {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    min-height: 2rem;
    min-width: 2rem;
    padding: 0 0.5rem;
  }

  .doc-editor__surface {
    position: relative;
  }

  :global(.doc-editor__content .ProseMirror) {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    min-height: 16rem;
    padding: 0.75rem;
  }

  :global(.wikilink-chip) {
    border-radius: 0.25rem;
    padding: 0.0625rem 0.25rem;
    text-decoration: none;
  }

  :global(.wikilink-chip--resolved) {
    background: #dbeafe;
    color: #1d4ed8;
  }

  :global(.wikilink-chip--unresolved) {
    background: #ffedd5;
    color: #c2410c;
  }

  :global(.mention-chip) {
    border-radius: 0.25rem;
    font-weight: 600;
    padding: 0.0625rem 0.25rem;
    white-space: nowrap;
  }

  :global(.mention-chip--user) {
    background: #dcfce7;
    color: #166534;
  }

  :global(.mention-chip--team) {
    background: #e0e7ff;
    color: #3730a3;
  }

  :global(.narration-block) {
    background: #eff6ff;
    border-left: 0.25rem solid #2563eb;
    border-radius: 0.375rem;
    color: #1e3a8a;
    cursor: default;
    margin: 0.75rem 0;
    padding: 0.75rem;
    user-select: text;
    white-space: pre-wrap;
  }

  :global(.doc-editor__content .ProseMirror:focus) {
    outline: 2px solid hsl(var(--ring, 222 84% 5%));
    outline-offset: 2px;
  }

  :global(.doc-editor__content table) {
    border-collapse: collapse;
    width: 100%;
  }

  :global(.doc-editor__content td) {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    min-width: 5rem;
    padding: 0.35rem;
  }

  .doc-editor__slash {
    background: hsl(var(--background, 0 0% 100%));
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    box-shadow: 0 10px 30px rgb(15 23 42 / 12%);
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    left: 0.75rem;
    max-height: 16rem;
    overflow: auto;
    padding: 0.25rem;
    position: absolute;
    top: 2.75rem;
    width: 14rem;
    z-index: 10;
  }

  .doc-editor__slash button {
    background: transparent;
    justify-content: flex-start;
    text-align: left;
  }

  .doc-editor__slash button.active,
  .doc-editor__slash button:hover {
    background: hsl(var(--muted, 210 40% 96%));
  }

  .doc-editor__status,
  .doc-editor__error {
    font-size: 0.75rem;
    margin-top: 0.35rem;
  }

  .doc-editor__error {
    color: hsl(var(--destructive, 0 84% 60%));
  }

  .doc-editor__search-bar {
    align-items: center;
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
    padding: 0.375rem;
  }

  .doc-editor__search-input {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.25rem;
    font-size: 0.8125rem;
    height: 1.75rem;
    padding: 0 0.5rem;
    width: 10rem;
  }

  .doc-editor__search-count {
    color: hsl(var(--muted-foreground, 215 20% 65%));
    font-size: 0.75rem;
    min-width: 4rem;
  }

  .doc-editor__search-btn {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.25rem;
    font-size: 0.75rem;
    height: 1.75rem;
    padding: 0 0.5rem;
  }

  :global(.callout) {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    gap: 0.5rem;
    align-items: start;
    border-left: 4px solid;
    border-radius: 0.375rem;
    margin: 0.75rem 0;
    padding: 0.75rem 1rem;
    color: oklch(0.25 0.01 270);
  }
  :global(.callout__icon) {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.875rem;
    color: oklch(0.99 0.005 270);
  }
  :global(.callout__body) {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  :global(.callout__body > *:first-child) {
    margin-top: 0;
  }
  :global(.callout--info) {
    background: oklch(0.97 0.03 240);
    border-color: oklch(0.62 0.15 240);
  }
  :global(.callout__icon--info) { background: oklch(0.62 0.15 240); }
  :global(.callout--warning) {
    background: oklch(0.97 0.05 80);
    border-color: oklch(0.7 0.16 80);
  }
  :global(.callout__icon--warning) { background: oklch(0.7 0.16 80); }
  :global(.callout--error) {
    background: oklch(0.96 0.04 25);
    border-color: oklch(0.62 0.2 25);
  }
  :global(.callout__icon--error) { background: oklch(0.62 0.2 25); }
  :global(.callout--success) {
    background: oklch(0.96 0.05 145);
    border-color: oklch(0.62 0.15 145);
  }
  :global(.callout__icon--success) { background: oklch(0.62 0.15 145); }
  :global(.callout--tip) {
    background: oklch(0.97 0.04 165);
    border-color: oklch(0.65 0.13 165);
  }
  :global(.callout__icon--tip) { background: oklch(0.65 0.13 165); }

  :global(.doc-editor__content details) {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    margin: 0.75rem 0;
    padding: 0.5rem 0.75rem;
  }
  :global(.doc-editor__content details summary) {
    cursor: pointer;
    font-weight: 500;
    padding: 0.25rem 0;
  }

  :global(.columns-layout) {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    margin: 0.75rem 0;
  }
  :global(.column) {
    border: 1px dashed hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    min-height: 3rem;
    padding: 0.5rem;
  }

  :global(.embed-wrapper) {
    border-radius: 0.5rem;
    margin: 0.75rem 0;
    overflow: hidden;
  }
  :global(.embed-wrapper iframe) {
    border: none;
    display: block;
    width: 100%;
  }

  :global(.status-badge) {
    border-radius: 0.25rem;
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
  }
  :global(.status-badge--blue) { background: #dbeafe; color: #1d4ed8; }
  :global(.status-badge--green) { background: #dcfce7; color: #166534; }
  :global(.status-badge--yellow) { background: #fef9c3; color: #854d0e; }
  :global(.status-badge--red) { background: #fee2e2; color: #991b1b; }
  :global(.status-badge--gray) { background: #f3f4f6; color: #374151; }
</style>
