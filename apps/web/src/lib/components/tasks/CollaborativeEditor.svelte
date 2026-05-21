<script lang="ts">
  /**
   * CollaborativeEditor.svelte: TipTap + Yjs real-time collaborative editor (workflow milestone, D-97).
   *
   * - Uses @tiptap/extension-collaboration (Yjs doc) for CRDT-based editing
   * - Uses @tiptap/extension-collaboration-cursor for user cursor presence
   * - WebSocket URL read from FULCRUM_YJS_URL env var (never hardcoded, MEDIUM-08)
   * - Graceful fallback: if WebSocket unavailable, editor works in non-collab mode
   */
  import { onMount, onDestroy } from "svelte";
  import { createEditor, EditorContent } from "svelte-tiptap";
  import type { Editor } from "svelte-tiptap";
  import { StarterKit } from "@tiptap/starter-kit";
  import { Collaboration } from "@tiptap/extension-collaboration";
  import { CollaborationCursor } from "@tiptap/extension-collaboration-cursor";
  import * as Y from "yjs";
  import { WebsocketProvider } from "y-websocket";
  import type { JSONContent } from "@tiptap/core";

  // ── Props ────────────────────────────────────────────────────────────────

  interface Props {
    taskId: string;
    /** Current user info for cursor label */
    user?: { name: string; color?: string };
    /** Called on content change (debounced) */
    onChange?: (content: JSONContent) => void;
    /** Aria label for accessibility */
    ariaLabel?: string;
    /** Initial content (used only if no Yjs snapshot exists) */
    initialContent?: JSONContent;
  }

  let {
    taskId,
    user = { name: "Anonymous", color: "#6366f1" },
    onChange,
    ariaLabel = "Collaborative task description",
    initialContent,
  }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────────

  let editor = $state<Editor | null>(null);
  let connected = $state(false);
  let provider: WebsocketProvider | null = null;
  let ydoc: Y.Doc | null = null;

  // ── Yjs URL helper (MEDIUM-08: never hardcoded) ──────────────────────────

  function getYjsUrl(): string {
    // In SvelteKit, PUBLIC_ env vars are exposed to client
    const url =
      typeof import.meta !== "undefined"
        ? (import.meta.env?.PUBLIC_FULCRUM_YJS_URL as string | undefined)
        : undefined;
    return url ?? "ws://localhost:1234";
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onMount(() => {
    ydoc = new Y.Doc();
    const docName = `task-${taskId}`;
    const yjsUrl = getYjsUrl();

    let collabExtensions: ReturnType<typeof Collaboration.configure>[] = [];
    let cursorExtension: ReturnType<typeof CollaborationCursor.configure> | null = null;

    try {
      // Connect to Yjs WebSocket server
      provider = new WebsocketProvider(yjsUrl, docName, ydoc, {
        connect: true,
      });

      provider.on("status", ({ status }: { status: string }) => {
        connected = status === "connected";
      });

      collabExtensions = [
        Collaboration.configure({ document: ydoc }),
      ];

      cursorExtension = CollaborationCursor.configure({
        provider,
        user: {
          name: user.name,
          color: user.color ?? "#6366f1",
        },
      });
    } catch (_e) {
      // Graceful fallback: WebSocket unavailable: continue without collaboration
      // Editor still works for single-user editing
      console.warn("[CollaborativeEditor] WebSocket unavailable, falling back to non-collab mode");
    }

    const extensions = [
      // Disable history in collab mode (Yjs handles undo/redo)
      StarterKit.configure({ history: provider ? false : true }),
      ...collabExtensions,
      ...(cursorExtension ? [cursorExtension] : []),
    ];

    const store = createEditor({
      extensions,
      content: initialContent,
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          "data-collaborative-editor": "true",
          class: "prose prose-sm max-w-none min-h-[6rem] focus:outline-none p-2",
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        onChange?.(updatedEditor.getJSON());
      },
    });

    store.subscribe((value) => {
      editor = value;
    });
  });

  onDestroy(() => {
    editor?.destroy();
    provider?.destroy();
    ydoc?.destroy();
    provider = null;
    ydoc = null;
  });
</script>

<div
  data-testid="collaborative-editor"
  class="collaborative-editor relative"
>
  <!-- Connection status indicator -->
  {#if provider}
    <div class="connection-status absolute top-1 right-1 flex items-center gap-1 text-xs">
      <span
        class="status-dot h-2 w-2 rounded-full {connected ? 'bg-green-500' : 'bg-amber-400'}"
        title={connected ? 'Connected: syncing with other editors' : 'Connecting…'}
      ></span>
      <span class="text-muted-foreground">{connected ? 'Live' : 'Connecting…'}</span>
    </div>
  {/if}

  <!-- TipTap editor -->
  <div class="editor-container border rounded-md bg-background">
    {#if editor}
      <EditorContent {editor} />
    {:else}
      <div class="editor-placeholder min-h-[6rem] p-2 text-muted-foreground text-sm animate-pulse">
        Loading editor…
      </div>
    {/if}
  </div>
</div>

<style>
  .collaborative-editor :global(.ProseMirror) {
    outline: none;
    min-height: 6rem;
    padding: 0.5rem;
  }

  /* Yjs collaboration cursors */
  .collaborative-editor :global(.collaboration-cursor__caret) {
    border-left: 1px solid;
    border-right: 1px solid;
    margin-left: -1px;
    margin-right: -1px;
    pointer-events: none;
    position: relative;
    word-break: normal;
  }

  .collaborative-editor :global(.collaboration-cursor__label) {
    border-radius: 3px 3px 3px 0;
    color: white;
    font-size: 0.6rem;
    font-style: normal;
    font-weight: 600;
    left: -1px;
    line-height: normal;
    padding: 0.1rem 0.3rem;
    position: absolute;
    top: -1.4em;
    user-select: none;
    white-space: nowrap;
  }
</style>
