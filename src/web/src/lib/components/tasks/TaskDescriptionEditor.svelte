<script lang="ts">
  import type { JSONContent } from "@tiptap/core";
  import { StarterKit } from "@tiptap/starter-kit";
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import type { Unsubscriber } from "svelte/store";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import type { Editor } from "svelte-tiptap";
  import {
    extractMentionLabels,
    extractWikilinkSlugs,
    sameJson,
    type MentionTarget,
    type WikilinkToken,
  } from "./task-description";

  interface Props {
    taskId: string;
    content?: JSONContent;
    save?: (taskId: string, content: JSONContent) => Promise<void> | void;
    resolveDoc?: (slug: string) => Promise<{ id: string } | null>;
    mentionTargets?: MentionTarget[];
    onmention_created?: (event: CustomEvent<{ task_id: string; mentioned_id: string; kind: "user" | "agent" }>) => void;
    ariaLabel?: string;
  }

  const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
  const dispatch = createEventDispatcher<{
    mention_created: { task_id: string; mentioned_id: string; kind: "user" | "agent" };
  }>();

  let {
    taskId,
    content = EMPTY_DOC,
    save,
    resolveDoc,
    mentionTargets = [],
    onmention_created,
    ariaLabel = "Task description",
  }: Props = $props();

  let editor = $state<Editor | null>(null);
  let unsubscribe: Unsubscriber | undefined;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /* svelte-ignore state_referenced_locally */
  let lastSaved = $state(JSON.stringify(content));
  /* svelte-ignore state_referenced_locally */
  let latestJson = $state<JSONContent>(content);
  let wikilinks = $state<WikilinkToken[]>([]);
  let visibleMentionLabel = $state<string | null>(null);

  async function refreshWikilinks(next: JSONContent): Promise<void> {
    const slugs = extractWikilinkSlugs(next);
    wikilinks = await Promise.all(slugs.map(async (slug) => {
      const doc = resolveDoc ? await resolveDoc(slug) : null;
      return { slug, docId: doc?.id ?? null, status: doc ? "resolved" : "missing" };
    }));
  }

  function scheduleSave(next: JSONContent): void {
    latestJson = next;
    void refreshWikilinks(next);
    visibleMentionLabel = extractMentionLabels(next).find((label) =>
      mentionTargets.some((target) => target.label === label)
    ) ?? null;

    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      autosaveTimer = null;
      if (JSON.stringify(next) === lastSaved) return;
      await save?.(taskId, next);
      lastSaved = JSON.stringify(next);
    }, 1500);
  }

  function emitMention(target: MentionTarget): void {
    const detail = { task_id: taskId, mentioned_id: target.id, kind: target.kind };
    dispatch("mention_created", detail);
    onmention_created?.(new CustomEvent("mention_created", { detail }));
    visibleMentionLabel = null;
  }

  onMount(() => {
    void refreshWikilinks(content);
    visibleMentionLabel = extractMentionLabels(content).find((label) =>
      mentionTargets.some((target) => target.label === label)
    ) ?? null;

    const store = createEditor({
      extensions: [StarterKit],
      content,
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          "data-task-description-input": "true",
        },
      },
      onUpdate: ({ editor: updatedEditor }) => scheduleSave(updatedEditor.getJSON()),
    });

    unsubscribe = store.subscribe((nextEditor) => {
      editor = nextEditor;
      latestJson = nextEditor.getJSON();
    });
  });

  $effect(() => {
    if (!editor) return;
    if (!sameJson(content, latestJson)) {
      editor.commands.setContent(content, { emitUpdate: false });
      latestJson = editor.getJSON();
      lastSaved = JSON.stringify(latestJson);
      void refreshWikilinks(latestJson);
    }
  });

  onDestroy(() => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    unsubscribe?.();
  });

  const visibleMention = $derived(
    mentionTargets.find((target) => target.label === visibleMentionLabel) ?? null,
  );
</script>

<div data-task-description-editor data-task-id={taskId}>
  {#if editor}
    <div data-task-description-toolbar class="task-description__toolbar">
      <button type="button" aria-label="Bold" title="Bold" onclick={() => editor?.chain().focus().toggleBold().run()}>B</button>
      <button type="button" aria-label="Bullet list" title="Bullet list" onclick={() => editor?.chain().focus().toggleBulletList().run()}>•</button>
      <button type="button" aria-label="Numbered list" title="Numbered list" onclick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
      <button type="button" aria-label="Code block" title="Code block" onclick={() => editor?.chain().focus().toggleCodeBlock().run()}>{`</>`}</button>
      <button type="button" aria-label="Heading" title="Heading" onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H</button>
      <button type="button" aria-label="Image" title="Image">Img</button>
      <button type="button" aria-label="Math" title="Math">∑</button>
    </div>
    <EditorContent editor={editor} class="task-description__content" />
  {/if}

  <div data-task-description-wikilinks class="task-description__tokens">
    {#each wikilinks as link (link.slug)}
      <span
        data-wikilink
        data-wikilink-slug={link.slug}
        data-wikilink-status={link.status}
        class:missing={link.status === "missing"}
      >[[{link.slug}]]</span>
    {/each}
  </div>

  {#if visibleMention}
    <div data-mention-picker class="task-description__mention-picker">
      <button type="button" onclick={() => emitMention(visibleMention)}>{visibleMention.label}</button>
    </div>
  {/if}
</div>

<style>
  .task-description__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .task-description__toolbar button {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.375rem;
    min-height: 2rem;
    min-width: 2rem;
    padding: 0 0.45rem;
  }

  :global(.task-description__content .ProseMirror) {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    min-height: 8rem;
    padding: 0.75rem;
  }

  .task-description__tokens {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .task-description__tokens span {
    border-radius: 0.375rem;
    color: hsl(var(--primary, 222 47% 11%));
    font-size: 0.875rem;
    padding: 0.125rem 0.375rem;
  }

  .task-description__tokens span.missing {
    border-bottom: 1px dashed currentColor;
  }

  .task-description__mention-picker {
    border: 1px solid hsl(var(--border, 214 32% 91%));
    border-radius: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.25rem;
    width: max-content;
  }
</style>
